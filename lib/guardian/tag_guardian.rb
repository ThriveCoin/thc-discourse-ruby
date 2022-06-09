# frozen_string_literal: true

#mixin for all guardian methods dealing with tagging permissions
module TagGuardian
  def can_create_tag?
    SiteSetting.tagging_enabled && @user.has_trust_level_or_staff?(SiteSetting.min_trust_to_create_tag)
  end

  def can_tag_topics?
    SiteSetting.tagging_enabled && @user.has_trust_level_or_staff?(SiteSetting.min_trust_level_to_tag_topics)
  end

  def can_tag_pms?
    return false if @user.blank?
    SiteSetting.tagging_enabled && @user == Discourse.system_user || @user.group_users.exists?(group_id: SiteSetting.pm_tags_allowed_for_groups.to_s.split("|").map(&:to_i))
  end

  def can_admin_tags?
    is_staff? && SiteSetting.tagging_enabled
  end

  def can_admin_tag_groups?
    is_staff? && SiteSetting.tagging_enabled
  end

  def hidden_tag_names
    @hidden_tag_names ||= begin
      if SiteSetting.tagging_enabled && !is_staff?
        DiscourseTagging.hidden_tag_names(self)
      else
        []
      end
    end
  end
end
