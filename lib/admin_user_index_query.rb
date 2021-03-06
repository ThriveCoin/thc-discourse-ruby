# frozen_string_literal: true

class AdminUserIndexQuery

  def initialize(params = {}, klass = User, trust_levels = TrustLevel.levels)
    @params = params
    @query = initialize_query_with_order(klass)
    @trust_levels = trust_levels
  end

  attr_reader :params, :trust_levels

  SORTABLE_MAPPING = {
    'created' => 'created_at',
    'last_emailed' => "COALESCE(last_emailed_at, to_date('1970-01-01', 'YYYY-MM-DD'))",
    'seen' => "COALESCE(last_seen_at, to_date('1970-01-01', 'YYYY-MM-DD'))",
    'username' => 'username',
    'email' => 'email',
    'trust_level' => 'trust_level',
    'days_visited' => 'user_stats.days_visited',
    'posts_read' => 'user_stats.posts_read_count',
    'topics_viewed' => 'user_stats.topics_entered',
    'posts' => 'user_stats.post_count',
    'read_time' => 'user_stats.time_read'
  }

  def find_users(limit = 100)
    page = params[:page].to_i - 1
    if page < 0
      page = 0
    end
    find_users_query.limit(limit).offset(page * limit)
  end

  def count_users
    find_users_query.count
  end

  def custom_direction
    Discourse.deprecate(":ascending is deprecated please use :asc instead", output_in_test: true, drop_from: '2.9.0') if params[:ascending]
    asc = params[:asc] || params[:ascending]
    asc.present? && asc ? "ASC" : "DESC"
  end

  def initialize_query_with_order(klass)
    order = []

    custom_order = params[:order]
    if custom_order.present? &&
      without_dir = SORTABLE_MAPPING[custom_order.downcase.sub(/ (asc|desc)$/, '')]
      order << "#{without_dir} #{custom_direction}"
    end

    if !custom_order.present?
      if params[:query] == "active"
        order << "users.last_seen_at DESC NULLS LAST"
      else
        order << "users.created_at DESC"
      end

      order << "users.username"
    end

    query = klass
      .includes(:totps)
      .order(order.reject(&:blank?).join(","))

    unless params[:stats].present? && params[:stats] == false
      query = query.includes(:user_stat)
    end

    query = query.joins(:primary_email) if params[:show_emails] == "true"

    query
  end

  def filter_by_trust
    levels = trust_levels.map { |key, _| key.to_s }
    if levels.include?(params[:query])
      @query.where('trust_level = ?', trust_levels[params[:query].to_sym])
    end
  end

  def filter_by_query_classification
    case params[:query]
    when 'staff'      then @query.where("admin or moderator")
    when 'admins'     then @query.where(admin: true)
    when 'moderators' then @query.where(moderator: true)
    when 'silenced'   then @query.silenced
    when 'suspended'  then @query.suspended
    when 'pending'    then @query.not_suspended.where(approved: false, active: true)
    when 'staged'     then @query.where(staged: true)
    end
  end

  def filter_by_search
    if params[:email].present?
      return @query.joins(:primary_email).where('user_emails.email = ?', params[:email].downcase)
    end

    filter = params[:filter]
    if filter.present?
      filter = filter.strip
      if ip = IPAddr.new(filter) rescue nil
        @query.where('ip_address <<= :ip OR registration_ip_address <<= :ip', ip: ip.to_cidr_s)
      else
        @query.filter_by_username_or_email(filter)
      end
    end
  end

  def filter_by_ip
    if params[:ip].present?
      @query.where('ip_address = :ip OR registration_ip_address = :ip', ip: params[:ip].strip)
    end
  end

  def filter_exclude
    if params[:exclude].present?
      @query.where('users.id != ?', params[:exclude])
    end
  end

  # this might not be needed in rails 4 ?
  def append(active_relation)
    @query = active_relation if active_relation
  end

  def find_users_query
    append filter_by_trust
    append filter_by_query_classification
    append filter_by_ip
    append filter_exclude
    append filter_by_search
    @query
  end

end
