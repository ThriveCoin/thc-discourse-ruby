# frozen_string_literal: true

class QunitController < ApplicationController
  skip_before_action *%i{
    check_xhr
    preload_json
    redirect_to_login_if_required
  }
  layout false

  def is_ember_cli_proxy?
    request.headers["HTTP_X_DISCOURSE_EMBER_CLI"] == "true"
  end

  # only used in non-ember-cli test / dev
  def index
    raise Discourse::NotFound.new if is_ember_cli_proxy? || EmberCli.enabled?
    raise Discourse::InvalidAccess.new if Rails.env.production?
  end

  def theme
    raise Discourse::NotFound.new if !can_see_theme_qunit?

    param_key = nil
    @suggested_themes = nil
    if (id = get_param(:id)).present?
      theme = Theme.find_by(id: id.to_i)
      param_key = :id
    elsif (name = get_param(:name)).present?
      theme = Theme.find_by(name: name)
      param_key = :name
    elsif (url = get_param(:url)).present?
      theme = RemoteTheme.find_by(remote_url: url)&.theme
      param_key = :url
    end

    if param_key && theme.blank?
      return render plain: "Can't find theme with #{param_key} #{get_param(param_key).inspect}", status: :not_found
    end

    if !param_key
      @suggested_themes = Theme
        .where(
          id: ThemeField.where(target_id: Theme.targets[:tests_js]).distinct.pluck(:theme_id)
        )
        .order(updated_at: :desc)
        .pluck(:id, :name)
      return
    end

    request.env[:resolved_theme_id] = theme.id
    request.env[:skip_theme_ids_transformation] = true
  end

  protected

  def can_see_theme_qunit?
    return true if !Rails.env.production?
    current_user&.admin?
  end

  private

  def get_param(key)
    params[:"theme_#{key}"] || params[key]
  end
end
