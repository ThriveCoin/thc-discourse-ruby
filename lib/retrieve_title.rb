# frozen_string_literal: true

module RetrieveTitle
  CRAWL_TIMEOUT = 1

  def self.crawl(url, max_redirects: nil, initial_https_redirect_ignore_limit: false)
    fetch_title(
      url,
      max_redirects: max_redirects,
      initial_https_redirect_ignore_limit: initial_https_redirect_ignore_limit
    )
  rescue Exception => ex
    raise if Rails.env.test?
    Rails.logger.error(ex)
    nil
  end

  def self.extract_title(html, encoding = nil)
    title = nil
    if html =~ /<title>/ && html !~ /<\/title>/
      return nil
    end
    if doc = Nokogiri::HTML5(html, nil, encoding)

      title = doc.at('title')&.inner_text

      # A horrible hack - YouTube uses `document.title` to populate the title
      # for some reason. For any other site than YouTube this wouldn't be worth it.
      if title == "YouTube" && html =~ /document\.title *= *"(.*)";/
        title = Regexp.last_match[1].sub(/ - YouTube$/, '')
      end

      if !title && node = doc.at('meta[property="og:title"]')
        title = node['content']
      end
    end

    if title.present?
      title.gsub!(/\n/, ' ')
      title.gsub!(/ +/, ' ')
      title.strip!
      return title
    end
    nil
  end

  private

  def self.max_chunk_size(uri)
    # Exception for sites that leave the title until very late.
    return 500 if uri.host =~ /(^|\.)amazon\.(com|ca|co\.uk|es|fr|de|it|com\.au|com\.br|cn|in|co\.jp|com\.mx)$/
    return 300 if uri.host =~ /(^|\.)youtube\.com$/ || uri.host =~ /(^|\.)youtu\.be$/
    return 50 if uri.host =~ /(^|\.)github\.com$/

    # default is 20k
    20
  end

  # Fetch the beginning of a HTML document at a url
  def self.fetch_title(url, max_redirects: nil, initial_https_redirect_ignore_limit: false)
    fd = FinalDestination.new(
      url,
      timeout: CRAWL_TIMEOUT,
      stop_at_blocked_pages: true,
      max_redirects: max_redirects,
      initial_https_redirect_ignore_limit: initial_https_redirect_ignore_limit
    )

    current = nil
    title = nil
    encoding = nil

    fd.get do |_response, chunk, uri|
      unless Net::HTTPRedirection === _response
        throw :done if uri.blank?

        if current
          current << chunk
        else
          current = chunk
        end

        if !encoding && content_type = _response['content-type']&.strip&.downcase
          if content_type =~ /charset="?([a-z0-9_-]+)"?/
            encoding = Regexp.last_match(1)
            if !Encoding.list.map(&:name).map(&:downcase).include?(encoding)
              encoding = nil
            end
          end
        end

        max_size = max_chunk_size(uri) * 1024
        title = extract_title(current, encoding)
        throw :done if title || max_size < current.length
      end
    end
    title
  end
end
