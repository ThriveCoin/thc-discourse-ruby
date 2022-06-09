# frozen_string_literal: true

require "aws-sdk-s3"

class S3Helper
  FIFTEEN_MEGABYTES = 15 * 1024 * 1024

  class SettingMissing < StandardError; end

  attr_reader :s3_bucket_name, :s3_bucket_folder_path

  ##
  # Controls the following:
  #
  # * cache time for secure-media URLs
  # * expiry time for S3 presigned URLs, which include backup downloads and
  #   any upload that has a private ACL (e.g. secure uploads)
  #
  # SiteSetting.s3_presigned_get_url_expires_after_seconds

  ##
  # Controls the following:
  #
  # * presigned put_object URLs for direct S3 uploads
  UPLOAD_URL_EXPIRES_AFTER_SECONDS ||= 10.minutes.to_i

  def initialize(s3_bucket_name, tombstone_prefix = '', options = {})
    @s3_client = options.delete(:client)
    @s3_options = default_s3_options.merge(options)

    @s3_bucket_name, @s3_bucket_folder_path = begin
      raise Discourse::InvalidParameters.new("s3_bucket_name") if s3_bucket_name.blank?
      self.class.get_bucket_and_folder_path(s3_bucket_name)
    end

    @tombstone_prefix =
      if @s3_bucket_folder_path
        File.join(@s3_bucket_folder_path, tombstone_prefix)
      else
        tombstone_prefix
      end
  end

  def self.build_from_config(use_db_s3_config: false, for_backup: false, s3_client: nil)
    setting_klass = use_db_s3_config ? SiteSetting : GlobalSetting
    options = S3Helper.s3_options(setting_klass)
    options[:client] = s3_client if s3_client.present?

    bucket =
      if for_backup
        setting_klass.s3_backup_bucket
      else
        use_db_s3_config ? SiteSetting.s3_upload_bucket : GlobalSetting.s3_bucket
      end

    S3Helper.new(bucket.downcase, '', options)
  end

  def self.get_bucket_and_folder_path(s3_bucket_name)
    s3_bucket_name.downcase.split("/", 2)
  end

  def upload(file, path, options = {})
    path = get_path_for_s3_upload(path)
    obj = s3_bucket.object(path)

    etag = begin
      if File.size(file.path) >= FIFTEEN_MEGABYTES
        options[:multipart_threshold] = FIFTEEN_MEGABYTES
        obj.upload_file(file, options)
        obj.load
        obj.etag
      else
        options[:body] = file
        obj.put(options).etag
      end
    end

    [path, etag.gsub('"', '')]
  end

  def path_from_url(url)
    URI.parse(url).path.delete_prefix("/")
  end

  def remove(s3_filename, copy_to_tombstone = false)
    s3_filename = s3_filename.dup

    # copy the file in tombstone
    if copy_to_tombstone && @tombstone_prefix.present?
      self.copy(
        get_path_for_s3_upload(s3_filename),
        File.join(@tombstone_prefix, s3_filename)
      )
    end

    # delete the file
    s3_filename.prepend(multisite_upload_path) if Rails.configuration.multisite
    delete_object(get_path_for_s3_upload(s3_filename))
  rescue Aws::S3::Errors::NoSuchKey
  end

  def delete_object(key)
    s3_bucket.object(key).delete
  rescue Aws::S3::Errors::NoSuchKey
  end

  def copy(source, destination, options: {})
    if options[:apply_metadata_to_destination]
      options = options.except(:apply_metadata_to_destination).merge(metadata_directive: "REPLACE")
    end

    destination = get_path_for_s3_upload(destination)
    if !Rails.configuration.multisite
      options[:copy_source] = File.join(@s3_bucket_name, source)
    else
      if source.include?(multisite_upload_path) || source.include?(@tombstone_prefix)
        options[:copy_source] = File.join(@s3_bucket_name, source)
      elsif @s3_bucket_folder_path
        folder, filename = begin
                             source.split("/", 2)
                           end
        options[:copy_source] = File.join(@s3_bucket_name, folder, multisite_upload_path, filename)
      else
        options[:copy_source] = File.join(@s3_bucket_name, multisite_upload_path, source)
      end
    end

    destination_object = s3_bucket.object(destination)

    # TODO: copy_source is a legacy option here and may become unsupported
    # in later versions, we should change to use Aws::S3::Client#copy_object
    # at some point.
    #
    # See https://github.com/aws/aws-sdk-ruby/blob/version-3/gems/aws-sdk-s3/lib/aws-sdk-s3/customizations/object.rb#L67-L74
    #
    # ----
    #
    # Also note, any options for metadata (e.g. content_disposition, content_type)
    # will not be applied unless the metadata_directive = "REPLACE" option is passed
    # in. If this is not passed in, the source object's metadata will be used.
    response = destination_object.copy_from(options)

    [destination, response.copy_object_result.etag.gsub('"', '')]
  end

  # Several places in the application need certain CORS rules to exist
  # inside an S3 bucket so requests to the bucket can be made
  # directly from the browser. The s3:ensure_cors_rules rake task
  # is used to ensure these rules exist for assets, S3 backups, and
  # direct S3 uploads, depending on configuration.
  def ensure_cors!(rules = nil)
    return unless SiteSetting.s3_install_cors_rule
    rules = [rules] if !rules.is_a?(Array)
    existing_rules = fetch_bucket_cors_rules

    new_rules = rules - existing_rules
    return false if new_rules.empty?

    final_rules = existing_rules + new_rules

    begin
      s3_resource.client.put_bucket_cors(
        bucket: @s3_bucket_name,
        cors_configuration: {
          cors_rules: final_rules
        }
      )
    rescue Aws::S3::Errors::AccessDenied => err
      # TODO (martin) Remove this warning log level once we are sure this new
      # ensure_cors! rule is functioning correctly.
      Discourse.warn_exception(err, message: "Could not PutBucketCors rules for #{@s3_bucket_name}, rules: #{final_rules}")
      return false
    end

    true
  end

  def update_lifecycle(id, days, prefix: nil, tag: nil)
    filter = {}

    if prefix
      filter[:prefix] = prefix
    elsif tag
      filter[:tag] = tag
    end

    # cf. http://docs.aws.amazon.com/AmazonS3/latest/dev/object-lifecycle-mgmt.html
    rule = {
      id: id,
      status: "Enabled",
      expiration: { days: days },
      filter: filter
    }

    rules = []

    begin
      rules = s3_resource.client.get_bucket_lifecycle_configuration(bucket: @s3_bucket_name).rules
    rescue Aws::S3::Errors::NoSuchLifecycleConfiguration
      # skip trying to merge
    end

    # in the past we has a rule that was called purge-tombstone vs purge_tombstone
    # just go ahead and normalize for our bucket
    rules.delete_if do |r|
      r.id.gsub('_', '-') == id.gsub('_', '-')
    end

    rules << rule

    # normalize filter in rules, due to AWS library bug
    rules = rules.map do |r|
      r = r.to_h
      prefix = r.delete(:prefix)
      if prefix
        r[:filter] = { prefix: prefix }
      end
      r
    end

    s3_resource.client.put_bucket_lifecycle_configuration(
      bucket: @s3_bucket_name,
      lifecycle_configuration: {
        rules: rules
    })
  end

  def update_tombstone_lifecycle(grace_period)
    return if !SiteSetting.s3_configure_tombstone_policy
    return if @tombstone_prefix.blank?
    update_lifecycle("purge_tombstone", grace_period, prefix: @tombstone_prefix)
  end

  def list(prefix = "", marker = nil)
    options = { prefix: get_path_for_s3_upload(prefix) }
    options[:marker] = marker if marker.present?
    s3_bucket.objects(options)
  end

  def tag_file(key, tags)
    tag_array = []
    tags.each do |k, v|
      tag_array << { key: k.to_s, value: v.to_s }
    end

    s3_resource.client.put_object_tagging(
      bucket: @s3_bucket_name,
      key: key,
      tagging: {
        tag_set: tag_array
      }
    )
  end

  def object(path)
    s3_bucket.object(get_path_for_s3_upload(path))
  end

  def self.s3_options(obj)
    opts = {
      region: obj.s3_region
    }

    opts[:endpoint] = SiteSetting.s3_endpoint if SiteSetting.s3_endpoint.present?
    opts[:http_continue_timeout] = SiteSetting.s3_http_continue_timeout

    unless obj.s3_use_iam_profile
      opts[:access_key_id] = obj.s3_access_key_id
      opts[:secret_access_key] = obj.s3_secret_access_key
    end

    opts
  end

  def download_file(filename, destination_path, failure_message = nil)
    object(filename).download_file(destination_path)
  rescue => err
    raise failure_message&.to_s || "Failed to download #{filename} because #{err.message.length > 0 ? err.message : err.class.to_s}"
  end

  def s3_client
    @s3_client ||= Aws::S3::Client.new(@s3_options)
  end

  def s3_inventory_path(path = 'inventory')
    get_path_for_s3_upload(path)
  end

  def abort_multipart(key:, upload_id:)
    s3_client.abort_multipart_upload(
      bucket: s3_bucket_name,
      key: key,
      upload_id: upload_id
    )
  end

  def create_multipart(key, content_type, metadata: {})
    response = s3_client.create_multipart_upload(
      acl: "private",
      bucket: s3_bucket_name,
      key: key,
      content_type: content_type,
      metadata: metadata
    )
    { upload_id: response.upload_id, key: key }
  end

  def presign_multipart_part(upload_id:, key:, part_number:)
    presigned_url(
      key,
      method: :upload_part,
      expires_in: S3Helper::UPLOAD_URL_EXPIRES_AFTER_SECONDS,
      opts: {
        part_number: part_number,
        upload_id: upload_id
      }
    )
  end

  # Important note from the S3 documentation:
  #
  # This request returns a default and maximum of 1000 parts.
  # You can restrict the number of parts returned by specifying the
  # max_parts argument. If your multipart upload consists of more than 1,000
  # parts, the response returns an IsTruncated field with the value of true,
  # and a NextPartNumberMarker element.
  #
  # In subsequent ListParts requests you can include the part_number_marker arg
  # using the NextPartNumberMarker the field value from the previous response to
  # get more parts.
  #
  # See https://docs.aws.amazon.com/sdk-for-ruby/v3/api/Aws/S3/Client.html#list_parts-instance_method
  def list_multipart_parts(upload_id:, key:, max_parts: 1000, start_from_part_number: nil)
    options = {
      bucket: s3_bucket_name,
      key: key,
      upload_id: upload_id,
      max_parts: max_parts
    }

    if start_from_part_number.present?
      options[:part_number_marker] = start_from_part_number
    end

    s3_client.list_parts(options)
  end

  def complete_multipart(upload_id:, key:, parts:)
    s3_client.complete_multipart_upload(
      bucket: s3_bucket_name,
      key: key,
      upload_id: upload_id,
      multipart_upload: {
        parts: parts
      }
    )
  end

  def presigned_url(
    key,
    method:,
    expires_in: S3Helper::UPLOAD_URL_EXPIRES_AFTER_SECONDS,
    opts: {}
  )
    Aws::S3::Presigner.new(client: s3_client).presigned_url(
      method,
      {
        bucket: s3_bucket_name,
        key: key,
        expires_in: expires_in,
      }.merge(opts)
    )
  end

  private

  def fetch_bucket_cors_rules
    begin
      s3_resource.client.get_bucket_cors(
        bucket: @s3_bucket_name
      ).cors_rules&.map(&:to_h) || []
    rescue Aws::S3::Errors::NoSuchCORSConfiguration
      # no rule
      []
    end
  end

  def default_s3_options
    if SiteSetting.enable_s3_uploads?
      options = self.class.s3_options(SiteSetting)
      check_missing_site_options
      options
    elsif GlobalSetting.use_s3?
      self.class.s3_options(GlobalSetting)
    else
      {}
    end
  end

  def get_path_for_s3_upload(path)
    if @s3_bucket_folder_path &&
        !path.starts_with?(@s3_bucket_folder_path) &&
        !path.starts_with?(File.join(FileStore::BaseStore::TEMPORARY_UPLOAD_PREFIX, @s3_bucket_folder_path))
      return File.join(@s3_bucket_folder_path, path)
    end

    path
  end

  def multisite_upload_path
    path = File.join("uploads", RailsMultisite::ConnectionManagement.current_db, "/")
    return path if !Rails.env.test?
    File.join(path, "test_#{ENV['TEST_ENV_NUMBER'].presence || '0'}", "/")
  end

  def s3_resource
    Aws::S3::Resource.new(client: s3_client)
  end

  def s3_bucket
    @s3_bucket ||= begin
      bucket = s3_resource.bucket(@s3_bucket_name)
      bucket.create unless bucket.exists?
      bucket
    end
  end

  def check_missing_site_options
    unless SiteSetting.s3_use_iam_profile
      raise SettingMissing.new("access_key_id") if SiteSetting.s3_access_key_id.blank?
      raise SettingMissing.new("secret_access_key") if SiteSetting.s3_secret_access_key.blank?
    end
  end
end
