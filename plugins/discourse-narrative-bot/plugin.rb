# frozen_string_literal: true

# name: discourse-narrative-bot
# about: Introduces staff to Discourse
# version: 1.0
# authors: Nick Sahler, Alan Tan
# url: https://github.com/discourse/discourse/tree/main/plugins/discourse-narrative-bot
# transpile_js: true

enabled_site_setting :discourse_narrative_bot_enabled
hide_plugin if self.respond_to?(:hide_plugin)

if Rails.env == "development"
  # workaround, teach reloader to reload jobs
  # if we do not do this then
  #
  # 1. on reload rails goes and undefines Jobs::Base
  # 2. as a side effect this undefines Jobs::BotInput
  # 3. we have a post_edited hook that queues a job for bot input
  # 4. if you are not running sidekiq in dev every time you save a post it will trigger it
  # 5. but the constant can not be autoloaded
  Rails.configuration.autoload_paths << File.expand_path('../autoload/jobs', __FILE__)
end

require_relative 'lib/discourse_narrative_bot/welcome_post_type_site_setting.rb'
register_asset 'stylesheets/discourse-narrative-bot.scss'

after_initialize do
  SeedFu.fixture_paths << Rails.root.join("plugins", "discourse-narrative-bot", "db", "fixtures").to_s

  Mime::Type.register "image/svg+xml", :svg

  [
    '../autoload/jobs/regular/bot_input.rb',
    '../autoload/jobs/regular/narrative_timeout.rb',
    '../autoload/jobs/regular/narrative_init.rb',
    '../autoload/jobs/regular/send_default_welcome_message.rb',
    '../autoload/jobs/onceoff/discourse_narrative_bot/grant_badges.rb',
    '../autoload/jobs/onceoff/discourse_narrative_bot/remap_old_bot_images.rb',
    '../lib/discourse_narrative_bot/actions.rb',
    '../lib/discourse_narrative_bot/base.rb',
    '../lib/discourse_narrative_bot/new_user_narrative.rb',
    '../lib/discourse_narrative_bot/advanced_user_narrative.rb',
    '../lib/discourse_narrative_bot/track_selector.rb',
    '../lib/discourse_narrative_bot/certificate_generator.rb',
    '../lib/discourse_narrative_bot/dice.rb',
    '../lib/discourse_narrative_bot/quote_generator.rb',
    '../lib/discourse_narrative_bot/magic_8_ball.rb',
    '../lib/discourse_narrative_bot/welcome_post_type_site_setting.rb'
  ].each { |path| load File.expand_path(path, __FILE__) }

  RailsMultisite::ConnectionManagement.safe_each_connection do
    if SiteSetting.discourse_narrative_bot_enabled
      # Disable welcome message because that is what the bot is supposed to replace.
      SiteSetting.send_welcome_message = false

      certificate_path = "#{Discourse.base_url}/discobot/certificate.svg"
      if !SiteSetting.allowed_iframes.include?(certificate_path)
        SiteSetting.allowed_iframes = SiteSetting.allowed_iframes.split('|').append(certificate_path).join('|')
      end
    end
  end

  require_dependency 'plugin_store'

  module ::DiscourseNarrativeBot
    PLUGIN_NAME = "discourse-narrative-bot".freeze
    BOT_USER_ID = -2

    class Engine < ::Rails::Engine
      engine_name PLUGIN_NAME
      isolate_namespace DiscourseNarrativeBot
    end

    class Store
      def self.set(key, value)
        ::PluginStore.set(PLUGIN_NAME, key, value)
      end

      def self.get(key)
        ::PluginStore.get(PLUGIN_NAME, key)
      end

      def self.remove(key)
        ::PluginStore.remove(PLUGIN_NAME, key)
      end
    end

    class CertificatesController < ::ApplicationController
      layout :false
      skip_before_action :check_xhr
      requires_login

      def generate
        immutable_for(24.hours)

        %i[date user_id].each do |key|
          raise Discourse::InvalidParameters.new("#{key} must be present") unless params[key]&.present?
        end

        if params[:user_id].to_i != current_user.id
          rate_limiter = RateLimiter.new(current_user, 'svg_certificate', 3, 1.minute)
        else
          rate_limiter = RateLimiter.new(current_user, 'svg_certificate_self', 30, 10.minutes)
        end
        rate_limiter.performed! unless current_user.staff?

        user = User.find_by(id: params[:user_id])
        raise Discourse::NotFound if user.blank?

        hijack do
          generator = CertificateGenerator.new(user, params[:date], avatar_url(user))

          svg = params[:type] == 'advanced' ? generator.advanced_user_track : generator.new_user_track

          respond_to do |format|
            format.svg { render inline: svg }
          end
        end
      end

      private

      def avatar_url(user)
        UrlHelper.absolute(Discourse.base_path + user.avatar_template.gsub('{size}', '250'))
      end
    end
  end

  DiscourseNarrativeBot::Engine.routes.draw do
    get "/certificate" => "certificates#generate", format: :svg
  end

  Discourse::Application.routes.append do
    mount ::DiscourseNarrativeBot::Engine, at: "/discobot"
  end

  self.add_model_callback(User, :after_destroy) do
    DiscourseNarrativeBot::Store.remove(self.id)
  end

  self.on(:user_created) do |user|
    if SiteSetting.discourse_narrative_bot_welcome_post_delay == 0 && !user.staged
      user.enqueue_bot_welcome_post
    end
  end

  self.on(:user_first_logged_in) do |user|
    if SiteSetting.discourse_narrative_bot_welcome_post_delay > 0
      user.enqueue_bot_welcome_post
    end
  end

  self.on(:user_unstaged) do |user|
    user.enqueue_bot_welcome_post
  end

  self.add_model_callback(UserOption, :after_save) do
    if saved_change_to_skip_new_user_tips? && self.skip_new_user_tips
      user.delete_bot_welcome_post
    end
  end

  self.add_to_class(:user, :enqueue_bot_welcome_post) do
    return if SiteSetting.disable_discourse_narrative_bot_welcome_post

    delay = SiteSetting.discourse_narrative_bot_welcome_post_delay

    case SiteSetting.discourse_narrative_bot_welcome_post_type
    when 'new_user_track'
      if enqueue_narrative_bot_job? && !manually_disabled_discobot?
        Jobs.enqueue_in(delay, :narrative_init,
          user_id: self.id,
          klass: DiscourseNarrativeBot::NewUserNarrative.to_s
        )
      end
    when 'welcome_message'
      Jobs.enqueue_in(delay, :send_default_welcome_message, user_id: self.id)
    end
  end

  self.add_to_class(:user, :manually_disabled_discobot?) do
    user_option&.skip_new_user_tips
  end

  self.add_to_class(:user, :enqueue_narrative_bot_job?) do
    SiteSetting.discourse_narrative_bot_enabled &&
      self.human? &&
      !self.anonymous? &&
      !self.staged &&
      !SiteSetting.discourse_narrative_bot_ignored_usernames.split('|'.freeze).include?(self.username)
  end

  self.add_to_class(:user, :delete_bot_welcome_post) do
    data = DiscourseNarrativeBot::Store.get(self.id) || {}
    topic_id = data[:topic_id]
    return if topic_id.blank? || data[:track] != DiscourseNarrativeBot::NewUserNarrative.to_s

    topic_user = topic_users.find_by(topic_id: topic_id)
    return if topic_user.present? && topic_user.last_read_post_number.present?

    topic = Topic.find_by(id: topic_id)
    return if topic.blank?

    first_post = topic.ordered_posts.first

    notification = Notification.where(topic_id: topic.id, post_number: first_post.post_number).first
    if notification.present?
      Notification.read(self, notification.id)
      self.saw_notification_id(notification.id)
      self.reload
      self.publish_notifications_state
    end

    PostDestroyer.new(Discourse.system_user, first_post, skip_staff_log: true).destroy
    DiscourseNarrativeBot::Store.remove(self.id)
  end

  self.on(:post_created) do |post, options|
    user = post.user

    if user&.enqueue_narrative_bot_job? && !options[:skip_bot]
      Jobs.enqueue(:bot_input,
        user_id: user.id,
        post_id: post.id,
        input: "reply"
      )
    end
  end

  self.on(:post_edited) do |post|
    if post.user&.enqueue_narrative_bot_job?
      Jobs.enqueue(:bot_input,
        user_id: post.user.id,
        post_id: post.id,
        input: "edit"
      )
    end
  end

  self.on(:post_destroyed) do |post, options, user|
    if user&.enqueue_narrative_bot_job? && !options[:skip_bot]
      Jobs.enqueue(:bot_input,
        user_id: user.id,
        post_id: post.id,
        topic_id: post.topic_id,
        input: "delete"
      )
    end
  end

  self.on(:post_recovered) do |post, _, user|
    if user&.enqueue_narrative_bot_job?
      Jobs.enqueue(:bot_input,
        user_id: user.id,
        post_id: post.id,
        input: "recover"
      )
    end
  end

  self.add_model_callback(PostAction, :after_commit, on: :create) do
    if self.post && self.user.enqueue_narrative_bot_job?
      input =
        case self.post_action_type_id
        when *PostActionType.flag_types.values
          self.post_action_type_id == PostActionType.types[:inappropriate] ? "flag" : "reply"
        when PostActionType.types[:like]
          "like"
        end

      if input
        Jobs.enqueue(:bot_input,
          user_id: self.user.id,
          post_id: self.post.id,
          input: input
        )
      end
    end
  end

  self.add_model_callback(Bookmark, :after_commit, on: :create) do
    if self.user.enqueue_narrative_bot_job?
      if self.bookmarkable_type == "Post"
        Jobs.enqueue(:bot_input, user_id: self.user_id, post_id: self.bookmarkable_id, input: "bookmark")
      end
    end
  end

  self.on(:topic_notification_level_changed) do |_, user_id, topic_id|
    user = User.find_by(id: user_id)

    if user && user.enqueue_narrative_bot_job?
      Jobs.enqueue(:bot_input,
        user_id: user_id,
        topic_id: topic_id,
        input: "topic_notification_level_changed"
      )
    end
  end

  UserAvatar.register_custom_user_gravatar_email_hash(
    DiscourseNarrativeBot::BOT_USER_ID,
    "discobot@discourse.org"
  )

  self.on(:system_message_sent) do |args|
    next if !SiteSetting.discourse_narrative_bot_enabled
    next if args[:message_type] != 'tl2_promotion_message'

    recipient = args[:post].topic.topic_users.where.not(user_id: args[:post].user_id).last&.user
    recipient ||= Discourse.site_contact_user if args[:post].user == Discourse.site_contact_user
    next if recipient.nil?

    I18n.with_locale(recipient.effective_locale) do
      raw = I18n.t("discourse_narrative_bot.tl2_promotion_message.text_body_template",
                   discobot_username: ::DiscourseNarrativeBot::Base.new.discobot_username,
                   reset_trigger: "#{::DiscourseNarrativeBot::TrackSelector.reset_trigger} #{::DiscourseNarrativeBot::AdvancedUserNarrative.reset_trigger}")

      PostCreator.create!(
        ::DiscourseNarrativeBot::Base.new.discobot_user,
        title: I18n.t("discourse_narrative_bot.tl2_promotion_message.subject_template"),
        raw: raw,
        skip_validations: true,
        archetype: Archetype.private_message,
        target_usernames: recipient.username
      )
    end
  end

  PostGuardian.class_eval do
    alias_method :existing_can_create_post?, :can_create_post?

    def can_create_post?(parent)
      return true if SiteSetting.discourse_narrative_bot_enabled &&
        parent.try(:subtype) == "system_message" &&
        parent.try(:user) == ::DiscourseNarrativeBot::Base.new.discobot_user

      existing_can_create_post?(parent)
    end
  end

end
