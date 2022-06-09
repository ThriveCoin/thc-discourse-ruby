# frozen_string_literal: true

# mixin for all guardian methods dealing with post permissions
module PostGuardian

  def unrestricted_link_posting?
    authenticated? && @user.has_trust_level?(TrustLevel[SiteSetting.min_trust_to_post_links])
  end

  def link_posting_access
    if unrestricted_link_posting?
      'full'
    elsif SiteSetting.allowed_link_domains.present?
      'limited'
    else
      'none'
    end
  end

  def can_post_link?(host: nil)
    return false if host.blank?

    unrestricted_link_posting? ||
      SiteSetting.allowed_link_domains.split('|').include?(host)
  end

  # Can the user act on the post in a particular way.
  #  taken_actions = the list of actions the user has already taken
  def post_can_act?(post, action_key, opts: {}, can_see_post: nil)
    return false unless (can_see_post.nil? && can_see_post?(post)) || can_see_post

    # no warnings except for staff
    return false if action_key == :notify_user && (post.user.blank? || (!is_staff? && opts[:is_warning].present? && opts[:is_warning] == 'true'))

    taken = opts[:taken_actions].try(:keys).to_a
    is_flag = PostActionType.notify_flag_types[action_key] || PostActionType.custom_types[action_key]
    already_taken_this_action = taken.any? && taken.include?(PostActionType.types[action_key])
    already_did_flagging      = taken.any? && (taken & PostActionType.notify_flag_types.values).any?

    result = if authenticated? && post && !@user.anonymous?

      # Silenced users can't flag
      return false if is_flag && @user.silenced?

      # Hidden posts can't be flagged
      return false if is_flag && post.hidden?

      # post made by staff, but we don't allow staff flags
      return false if is_flag &&
        (!SiteSetting.allow_flagging_staff?) &&
        post&.user&.staff?

      if action_key == :notify_user &&
         (!SiteSetting.enable_personal_messages? ||
         !@user.has_trust_level?(SiteSetting.min_trust_to_send_messages))

        return false
      end

      # we allow flagging for trust level 1 and higher
      # always allowed for private messages
      (is_flag && not(already_did_flagging) && (@user.has_trust_level?(TrustLevel[SiteSetting.min_trust_to_flag_posts]) || post.topic.private_message?)) ||

      # not a flagging action, and haven't done it already
      not(is_flag || already_taken_this_action) &&

      # nothing except flagging on archived topics
      not(post.topic&.archived?) &&

      # nothing except flagging on deleted posts
      not(post.trashed?) &&

      # don't like your own stuff
      not(action_key == :like && (post.user.blank? || is_my_own?(post)))
    end

    !!result
  end

  def can_lock_post?(post)
    can_see_post?(post) && is_staff?
  end

  # Can we see who acted on a post in a particular way?
  def can_see_post_actors?(topic, post_action_type_id)
    return true if is_admin?
    return false unless topic

    type_symbol = PostActionType.types[post_action_type_id]

    return false if type_symbol == :bookmark
    return false if type_symbol == :notify_user && !is_moderator?

    return can_see_flags?(topic) if PostActionType.is_flag?(type_symbol)

    true
  end

  def can_delete_all_posts?(user)
    is_staff? &&
    user &&
    !user.admin? &&
    (is_admin? ||
      ((user.first_post_created_at.nil? || user.first_post_created_at >= SiteSetting.delete_user_max_post_age.days.ago) &&
      user.post_count <= SiteSetting.delete_all_posts_max.to_i))
  end

  def can_create_post?(parent)
    return false if !SiteSetting.enable_system_message_replies? && parent.try(:subtype) == "system_message"

    (!SpamRule::AutoSilence.prevent_posting?(@user) || (!!parent.try(:private_message?) && parent.allowed_users.include?(@user))) && (
      !parent ||
      !parent.category ||
      Category.post_create_allowed(self).where(id: parent.category.id).count == 1
    )
  end

  def can_edit_post?(post)
    if Discourse.static_doc_topic_ids.include?(post.topic_id) && !is_admin?
      return false
    end

    return true if is_admin?

    # Must be staff to edit a locked post
    return false if post.locked? && !is_staff?

    return can_create_post?(post.topic) if (
      is_staff? ||
      (
        SiteSetting.trusted_users_can_edit_others? &&
        @user.has_trust_level?(TrustLevel[4])
      ) ||
      is_category_group_moderator?(post.topic&.category)
    )

    if post.topic&.archived? || post.user_deleted || post.deleted_at
      return false
    end

    # Editing a shared draft.
    return true if (
      can_see_post?(post) &&
      can_create_post?(post.topic) &&
      post.topic.category_id == SiteSetting.shared_drafts_category.to_i &&
      can_see_category?(post.topic.category) &&
      can_see_shared_draft?
    )

    if post.wiki && (@user.trust_level >= SiteSetting.min_trust_to_edit_wiki_post.to_i)
      return can_create_post?(post.topic)
    end

    if @user.trust_level < SiteSetting.min_trust_to_edit_post
      return false
    end

    if is_my_own?(post)

      return false if @user.silenced?

      return can_edit_hidden_post?(post) if post.hidden?

      if post.is_first_post? && post.topic.category_allows_unlimited_owner_edits_on_first_post?
        return true
      end

      return !post.edit_time_limit_expired?(@user)
    end

    if post.is_category_description?
      return true if can_edit_category_description?(post.topic.category)
    end

    false
  end

  def can_edit_hidden_post?(post)
    return false if post.nil?
    post.hidden_at.nil? || post.hidden_at < SiteSetting.cooldown_minutes_after_hiding_posts.minutes.ago
  end

  def can_delete_post_or_topic?(post)
    post.is_first_post? ? post.topic && can_delete_topic?(post.topic) : can_delete_post?(post)
  end

  def can_delete_post?(post)
    return false if !can_see_post?(post)

    # Can't delete the first post
    return false if post.is_first_post?

    return true if is_staff? || is_category_group_moderator?(post.topic&.category)

    # Can't delete posts in archived topics unless you are staff
    return false if post.topic&.archived?

    # You can delete your own posts
    if is_my_own?(post)
      return false if (SiteSetting.max_post_deletions_per_minute < 1 || SiteSetting.max_post_deletions_per_day < 1)
      return true if !post.user_deleted?
    end

    false
  end

  def can_permanently_delete_post?(post)
    return false if !SiteSetting.can_permanently_delete
    return false if !post
    return false if post.is_first_post?
    return false if !is_admin? || !can_edit_post?(post)
    return false if !post.deleted_at
    return false if post.deleted_by_id == @user.id && post.deleted_at >= Post::PERMANENT_DELETE_TIMER.ago
    true
  end

  def can_recover_post?(post)
    return false unless post

    # PERF, vast majority of the time topic will not be deleted
    topic = (post.topic || Topic.with_deleted.find(post.topic_id)) if post.topic_id
    return true if can_moderate_topic?(topic) && !!post.deleted_at

    if is_my_own?(post)
      return false if (SiteSetting.max_post_deletions_per_minute < 1 || SiteSetting.max_post_deletions_per_day < 1)
      return true if post.user_deleted && !post.deleted_at
    end

    false
  end

  def can_delete_post_action?(post_action)
    return false unless is_my_own?(post_action) && !post_action.is_private_message?

    post_action.created_at > SiteSetting.post_undo_action_window_mins.minutes.ago
  end

  def can_see_post?(post)
    return false if post.blank?
    return true if is_admin?
    return false unless can_see_topic?(post.topic)
    return false unless post.user == @user || Topic.visible_post_types(@user).include?(post.post_type)
    return true if is_moderator? || is_category_group_moderator?(post.topic.category)
    return true if post.deleted_at.blank? || (post.deleted_by_id == @user.id && @user.has_trust_level?(TrustLevel[4]))
    false
  end

  def can_view_edit_history?(post)
    return false unless post

    if !post.hidden
      return true if post.wiki || SiteSetting.edit_history_visible_to_public
    end

    authenticated? &&
    (is_staff? || @user.id == post.user_id) &&
    can_see_post?(post)
  end

  def can_change_post_owner?
    return true if is_admin?

    SiteSetting.moderators_change_post_ownership && is_staff?
  end

  def can_change_post_timestamps?
    is_staff?
  end

  def can_wiki?(post)
    return false unless authenticated?
    return true if is_staff? || @user.has_trust_level?(TrustLevel[4])

    if @user.has_trust_level?(SiteSetting.min_trust_to_allow_self_wiki) && is_my_own?(post)
      return false if post.hidden?
      return !post.edit_time_limit_expired?(@user)
    end

    false
  end

  def can_change_post_type?
    is_staff?
  end

  def can_rebake?
    is_staff? || @user.has_trust_level?(TrustLevel[4])
  end

  def can_see_flagged_posts?
    is_staff?
  end

  def can_see_deleted_posts?(category = nil)
    is_staff? || is_category_group_moderator?(category)
  end

  def can_view_raw_email?(post)
    post && (is_staff? || post.user_id == @user.id)
  end

  def can_unhide?(post)
    post.try(:hidden) && is_staff?
  end

  def can_skip_bump?
    is_staff? || @user.has_trust_level?(TrustLevel[4])
  end
end
