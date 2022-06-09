# frozen_string_literal: true

describe NotificationEmailer do

  before do
    freeze_time
    NotificationEmailer.enable
  end

  fab!(:topic) { Fabricate(:topic) }
  fab!(:post) { Fabricate(:post, topic: topic) }

  # something is off with fabricator
  def create_notification(type, user = nil)
    user ||= Fabricate(:user)
    Notification.create(data: "{\"a\": 1}",
                        user: user,
                        notification_type: Notification.types[type],
                        topic: topic,
                        post_number: post.post_number)
  end

  shared_examples "enqueue" do

    it "enqueues a job for the email" do
      expect_enqueued_with(
        job: :user_email,
        args: NotificationEmailer::EmailUser.notification_params(notification, type),
        at: no_delay ? Time.zone.now : Time.zone.now + delay
      ) do
        NotificationEmailer.process_notification(notification, no_delay: no_delay)
      end
    end

    context "inactive user" do
      before { notification.user.active = false }

      it "doesn't enqueue a job" do
        expect_not_enqueued_with(job: :user_email, args: { type: type }) do
          NotificationEmailer.process_notification(notification, no_delay: no_delay)
        end
      end

      it "enqueues a job if the user is staged for non-linked and non-quoted types" do
        notification.user.staged = true

        if type == :user_linked || type == :user_quoted
          expect_not_enqueued_with(
            job: :user_email,
            args: { type: type }
          ) do
            NotificationEmailer.process_notification(notification, no_delay: no_delay)
          end
        else
          expect_enqueued_with(
            job: :user_email,
            args: NotificationEmailer::EmailUser.notification_params(notification, type),
            at: no_delay ? Time.zone.now : Time.zone.now + delay
          ) do
            NotificationEmailer.process_notification(notification, no_delay: no_delay)
          end
        end
      end

      it "enqueues a job if the user is staged even if site requires user approval for non-linked and non-quoted typed" do
        notification.user.staged = true
        SiteSetting.must_approve_users = true

        if type == :user_linked || type == :user_quoted
          expect_not_enqueued_with(
            job: :user_email,
            args: { type: type }
          ) do
            NotificationEmailer.process_notification(notification, no_delay: no_delay)
          end
        else
          expect_enqueued_with(
            job: :user_email,
            args: NotificationEmailer::EmailUser.notification_params(notification, type),
            at: no_delay ? Time.zone.now : Time.zone.now + delay
          ) do
            NotificationEmailer.process_notification(notification, no_delay: no_delay)
          end
        end
      end
    end

    context "active but unapproved user" do
      before do
        SiteSetting.must_approve_users = true
        notification.user.approved = false
        notification.user.active = true
      end

      it "doesn't enqueue a job" do
        expect_not_enqueued_with(job: :user_email, args: { type: type }) do
          NotificationEmailer.process_notification(notification, no_delay: no_delay)
        end
      end
    end

    context "small action" do

      it "doesn't enqueue a job" do
        Post.any_instance.expects(:post_type).returns(Post.types[:small_action])

        expect_not_enqueued_with(job: :user_email, args: { type: type }) do
          NotificationEmailer.process_notification(notification, no_delay: no_delay)
        end
      end

    end

  end

  shared_examples "enqueue_public" do
    include_examples "enqueue"

    it "doesn't enqueue a job if the user has mention emails disabled" do
      notification.user.user_option.update_columns(email_level: UserOption.email_level_types[:never])

      expect_not_enqueued_with(job: :user_email, args: { type: type }) do
        NotificationEmailer.process_notification(notification, no_delay: no_delay)
      end
    end
  end

  shared_examples "enqueue_private" do
    include_examples "enqueue"

    it "doesn't enqueue a job if the user has private message emails disabled" do
      notification.user.user_option.update_columns(email_messages_level: UserOption.email_level_types[:never])

      expect_not_enqueued_with(job: :user_email, args: { type: type }) do
        NotificationEmailer.process_notification(notification)
      end
    end

  end

  [true, false].each do |no_delay|

    context 'user_mentioned' do
      let(:no_delay) { no_delay }
      let(:type) { :user_mentioned }
      let(:delay) { SiteSetting.email_time_window_mins.minutes }
      let!(:notification) { create_notification(:mentioned) }

      include_examples "enqueue_public"

      it "enqueue a delayed job for users that are online" do
        notification.user.last_seen_at = 1.minute.ago

        expect_enqueued_with(
          job: :user_email,
          args: NotificationEmailer::EmailUser.notification_params(notification, type),
          at: Time.zone.now + delay
        ) do
          NotificationEmailer.process_notification(notification)
        end
      end

    end

    context 'user_replied' do
      let(:no_delay) { no_delay }
      let(:type) { :user_replied }
      let(:delay) { SiteSetting.email_time_window_mins.minutes }
      let!(:notification) { create_notification(:replied) }

      include_examples "enqueue_public"
    end

    context 'user_quoted' do
      let(:no_delay) { no_delay }
      let(:type) { :user_quoted }
      let(:delay) { SiteSetting.email_time_window_mins.minutes }
      let!(:notification) { create_notification(:quoted) }

      include_examples "enqueue_public"
    end

    context 'user_linked' do
      let(:no_delay) { no_delay }
      let(:type) { :user_linked }
      let(:delay) { SiteSetting.email_time_window_mins.minutes }
      let!(:notification) { create_notification(:linked) }

      include_examples "enqueue_public"
    end

    context 'user_posted' do
      let(:no_delay) { no_delay }
      let(:type) { :user_posted }
      let(:delay) { SiteSetting.email_time_window_mins.minutes }
      let!(:notification) { create_notification(:posted) }

      include_examples "enqueue_public"
    end

    context 'user_private_message' do
      let(:no_delay) { no_delay }
      let(:type) { :user_private_message }
      let(:delay) { SiteSetting.personal_email_time_window_seconds }
      let!(:notification) { create_notification(:private_message) }

      include_examples "enqueue_private"

      it "doesn't enqueue a job for a small action" do
        notification.data_hash["original_post_type"] = Post.types[:small_action]

        expect_not_enqueued_with(job: :user_email, args: { type: type }) do
          NotificationEmailer.process_notification(notification)
        end
      end

    end

    context 'user_invited_to_private_message' do
      let(:no_delay) { no_delay }
      let(:type) { :user_invited_to_private_message }
      let(:delay) { SiteSetting.personal_email_time_window_seconds }
      let!(:notification) { create_notification(:invited_to_private_message) }

      include_examples "enqueue_public"
    end

    context 'user_invited_to_topic' do
      let(:no_delay) { no_delay }
      let(:type) { :user_invited_to_topic }
      let(:delay) { SiteSetting.personal_email_time_window_seconds }
      let!(:notification) { create_notification(:invited_to_topic) }

      include_examples "enqueue_public"
    end

    context 'watching the first post' do
      let(:no_delay) { no_delay }
      let(:type) { :user_watching_first_post }
      let(:delay) { SiteSetting.email_time_window_mins.minutes }
      let!(:notification) { create_notification(:watching_first_post) }

      include_examples "enqueue_public"
    end

    context 'post_approved' do
      let(:no_delay) { no_delay }
      let(:type) { :post_approved }
      let(:delay) { SiteSetting.email_time_window_mins.minutes }
      let!(:notification) { create_notification(:post_approved) }

      include_examples "enqueue_public"
    end
  end
end
