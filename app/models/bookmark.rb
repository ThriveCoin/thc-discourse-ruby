# frozen_string_literal: true

class Bookmark < ActiveRecord::Base
  self.ignored_columns = [
    "post_id", # TODO (martin) (2022-08-01) remove
    "for_topic" # TODO (martin) (2022-08-01) remove
  ]

  cattr_accessor :registered_bookmarkables
  self.registered_bookmarkables = []

  def self.registered_bookmarkable_from_type(type)
    Bookmark.registered_bookmarkables.find { |bm| bm.model.name == type }
  end

  def self.register_bookmarkable(bookmarkable_klass)
    return if Bookmark.registered_bookmarkable_from_type(bookmarkable_klass.model.name).present?
    Bookmark.registered_bookmarkables << RegisteredBookmarkable.new(bookmarkable_klass)
  end

  ##
  # This is called when the app loads, similar to AdminDashboardData.reset_problem_checks,
  # so the default Post and Topic bookmarkables are registered on
  # boot.
  #
  # This method also can be used in testing to reset bookmarkables between
  # tests. It will also fire multiple times in development mode because
  # classes are not cached.
  def self.reset_bookmarkables
    self.registered_bookmarkables = []

    Bookmark.register_bookmarkable(PostBookmarkable)
    Bookmark.register_bookmarkable(TopicBookmarkable)
  end
  reset_bookmarkables

  def self.valid_bookmarkable_types
    Bookmark.registered_bookmarkables.map(&:model).map(&:to_s)
  end

  belongs_to :user
  belongs_to :bookmarkable, polymorphic: true

  def self.auto_delete_preferences
    @auto_delete_preferences ||= Enum.new(
      never: 0,
      when_reminder_sent: 1,
      on_owner_reply: 2,
      clear_reminder: 3,
    )
  end

  def self.select_type(bookmarks_relation, type)
    bookmarks_relation.select { |bm| bm.bookmarkable_type == type }
  end

  validate :polymorphic_columns_present, on: [:create, :update]
  validate :valid_bookmarkable_type, on: [:create, :update]

  validate :unique_per_bookmarkable,
    on: [:create, :update],
    if: Proc.new { |b|
      b.will_save_change_to_bookmarkable_id? || b.will_save_change_to_bookmarkable_type? || b.will_save_change_to_user_id?
    }

  validate :ensure_sane_reminder_at_time, if: :will_save_change_to_reminder_at?
  validate :bookmark_limit_not_reached
  validates :name, length: { maximum: 100 }

  def registered_bookmarkable
    Bookmark.registered_bookmarkable_from_type(self.bookmarkable_type)
  end

  def polymorphic_columns_present
    return if self.bookmarkable_id.present? && self.bookmarkable_type.present?

    self.errors.add(:base, I18n.t("bookmarks.errors.bookmarkable_id_type_required"))
  end

  def unique_per_bookmarkable
    return if !Bookmark.exists?(user_id: user_id, bookmarkable_id: bookmarkable_id, bookmarkable_type: bookmarkable_type)

    self.errors.add(:base, I18n.t("bookmarks.errors.already_bookmarked", type: bookmarkable_type))
  end

  def ensure_sane_reminder_at_time
    return if reminder_at.blank?
    if reminder_at < Time.zone.now
      self.errors.add(:base, I18n.t("bookmarks.errors.cannot_set_past_reminder"))
    end
    if reminder_at > 10.years.from_now.utc
      self.errors.add(:base, I18n.t("bookmarks.errors.cannot_set_reminder_in_distant_future"))
    end
  end

  def bookmark_limit_not_reached
    return if user.bookmarks.count < SiteSetting.max_bookmarks_per_user
    return if !new_record?

    self.errors.add(
      :base,
      I18n.t(
        "bookmarks.errors.too_many",
        user_bookmarks_url: "#{Discourse.base_url}/my/activity/bookmarks",
        limit: SiteSetting.max_bookmarks_per_user
      )
    )
  end

  def valid_bookmarkable_type
    return if Bookmark.valid_bookmarkable_types.include?(self.bookmarkable_type)

    self.errors.add(:base, I18n.t("bookmarks.errors.invalid_bookmarkable", type: self.bookmarkable_type))
  end

  def auto_delete_when_reminder_sent?
    self.auto_delete_preference == Bookmark.auto_delete_preferences[:when_reminder_sent]
  end

  def auto_clear_reminder_when_reminder_sent?
    self.auto_delete_preference == Bookmark.auto_delete_preferences[:clear_reminder]
  end

  def reminder_at_ics(offset: 0)
    (reminder_at + offset).strftime(I18n.t("datetime_formats.formats.calendar_ics"))
  end

  def clear_reminder!
    update!(
      reminder_last_sent_at: Time.zone.now,
      reminder_set_at: nil,
    )
  end

  scope :with_reminders, -> do
    where("reminder_at IS NOT NULL")
  end

  scope :pending_reminders, ->(before_time = Time.now.utc) do
    with_reminders.where("reminder_at <= ?", before_time).where(reminder_last_sent_at: nil)
  end

  scope :pending_reminders_for_user, ->(user) do
    pending_reminders.where(user: user)
  end

  scope :for_user_in_topic, ->(user_id, topic_id) {
    joins("LEFT JOIN posts ON posts.id = bookmarks.bookmarkable_id AND bookmarks.bookmarkable_type = 'Post'")
      .joins("LEFT JOIN topics ON (topics.id = bookmarks.bookmarkable_id AND bookmarks.bookmarkable_type = 'Topic') OR
             (topics.id = posts.topic_id)")
      .where(
        "bookmarks.user_id = :user_id AND (topics.id = :topic_id OR posts.topic_id = :topic_id)
        AND posts.deleted_at IS NULL AND topics.deleted_at IS NULL",
        user_id: user_id, topic_id: topic_id
      )
  }

  def self.count_per_day(opts = nil)
    opts ||= {}
    result = where('bookmarks.created_at >= ?', opts[:start_date] || (opts[:since_days_ago] || 30).days.ago)

    if opts[:end_date]
      result = result.where('bookmarks.created_at <= ?', opts[:end_date])
    end

    if opts[:category_id]
      result = result
        .joins("LEFT JOIN posts ON posts.id = bookmarks.bookmarkable_id AND bookmarks.bookmarkable_type = 'Post'")
        .joins("LEFT JOIN topics ON (topics.id = bookmarks.bookmarkable_id AND bookmarks.bookmarkable_type = 'Topic') OR (topics.id = posts.topic_id)")
        .where("topics.deleted_at IS NULL AND posts.deleted_at IS NULL")
        .merge(Topic.in_category_and_subcategories(opts[:category_id]))
    end

    result.group('date(bookmarks.created_at)')
      .order('date(bookmarks.created_at)')
      .count
  end

  ##
  # Deletes bookmarks that are attached to posts/topics that were deleted
  # more than X days ago. We don't delete bookmarks instantly when a post/topic
  # is deleted so that there is a grace period to un-delete.
  def self.cleanup!
    grace_time = 3.days.ago
    topics_deleted = DB.query(<<~SQL, grace_time: grace_time)
      DELETE FROM bookmarks b
      USING topics t, posts p
      WHERE (t.id = p.topic_id AND (
          (b.bookmarkable_id = p.id AND b.bookmarkable_type = 'Post') OR
          (b.bookmarkable_id = p.id AND b.bookmarkable_type = 'Topic')
        ))
        AND (t.deleted_at < :grace_time OR p.deleted_at < :grace_time)
       RETURNING t.id AS topic_id
    SQL

    topics_deleted_ids = topics_deleted.map(&:topic_id).uniq
    topics_deleted_ids.each do |topic_id|
      Jobs.enqueue(:sync_topic_user_bookmarked, topic_id: topic_id)
    end
  end
end

# == Schema Information
#
# Table name: bookmarks
#
#  id                     :bigint           not null, primary key
#  user_id                :bigint           not null
#  name                   :string(100)
#  reminder_at            :datetime
#  created_at             :datetime         not null
#  updated_at             :datetime         not null
#  reminder_last_sent_at  :datetime
#  reminder_set_at        :datetime
#  auto_delete_preference :integer          default(0), not null
#  pinned                 :boolean          default(FALSE)
#  bookmarkable_id        :integer
#  bookmarkable_type      :string
#
# Indexes
#
#  idx_bookmarks_user_polymorphic_unique                 (user_id,bookmarkable_type,bookmarkable_id) UNIQUE
#  index_bookmarks_on_post_id                            (post_id)
#  index_bookmarks_on_reminder_at                        (reminder_at)
#  index_bookmarks_on_reminder_set_at                    (reminder_set_at)
#  index_bookmarks_on_user_id                            (user_id)
#  index_bookmarks_on_user_id_and_post_id_and_for_topic  (user_id,post_id,for_topic) UNIQUE
#
