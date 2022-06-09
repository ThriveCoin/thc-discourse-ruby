# frozen_string_literal: true

class UserOptionSerializer < ApplicationSerializer
  attributes :user_id,
             :mailing_list_mode,
             :mailing_list_mode_frequency,
             :email_digests,
             :email_level,
             :email_messages_level,
             :external_links_in_new_tab,
             :color_scheme_id,
             :dark_scheme_id,
             :dynamic_favicon,
             :enable_quoting,
             :enable_defer,
             :digest_after_minutes,
             :automatically_unpin_topics,
             :auto_track_topics_after_msecs,
             :notification_level_when_replying,
             :new_topic_duration_minutes,
             :email_previous_replies,
             :email_in_reply_to,
             :like_notification_frequency,
             :include_tl0_in_digests,
             :theme_ids,
             :theme_key_seq,
             :allow_private_messages,
             :enable_allowed_pm_users,
             :homepage_id,
             :hide_profile_and_presence,
             :text_size,
             :text_size_seq,
             :title_count_mode,
             :timezone,
             :skip_new_user_tips,
             :default_calendar,
             :oldest_search_log_date,
             :enable_experimental_sidebar

  def auto_track_topics_after_msecs
    object.auto_track_topics_after_msecs || SiteSetting.default_other_auto_track_topics_after_msecs
  end

  def notification_level_when_replying
    object.notification_level_when_replying || SiteSetting.default_other_notification_level_when_replying
  end

  def new_topic_duration_minutes
    object.new_topic_duration_minutes || SiteSetting.default_other_new_topic_duration_minutes
  end

  def theme_ids
    object.theme_ids.presence || [SiteSetting.default_theme_id]
  end

  def include_enable_experimental_sidebar?
    SiteSetting.enable_experimental_sidebar
  end

end
