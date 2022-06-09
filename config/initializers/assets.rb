# frozen_string_literal: true

# Be sure to restart your server when you modify this file.

# Enable the asset pipeline
Rails.application.config.assets.enabled = true

# Version of your assets, change this if you want to expire all your assets.
Rails.application.config.assets.version = "1.2.5"

# Add additional assets to the asset load path.
Rails.application.config.assets.paths << "#{Rails.root}/config/locales"
Rails.application.config.assets.paths << "#{Rails.root}/public/javascripts"

# Precompile additional assets.
# application.js, application.css, and all non-JS/CSS in the app/assets
# folder are already added.

# explicitly precompile any images in plugins ( /assets/images ) path
Rails.application.config.assets.precompile += [lambda do |filename, path|
  path =~ /assets\/images/ && !%w(.js .css).include?(File.extname(filename))
end]

Rails.application.config.assets.precompile += %w{
  vendor.js
  admin.js
  browser-detect.js
  browser-update.js
  break_string.js
  ember_jquery.js
  pretty-text-bundle.js
  wizard-application.js
  wizard-vendor.js
  markdown-it-bundle.js
  service-worker.js
  google-tag-manager.js
  google-universal-analytics-v3.js
  google-universal-analytics-v4.js
  start-discourse.js
  print-page.js
  omniauth-complete.js
  activate-account.js
  auto-redirect.js
  wizard-start.js
  locales/i18n.js
  discourse/app/lib/webauthn.js
  confirm-new-email/confirm-new-email.js
  confirm-new-email/bootstrap.js
  onpopstate-handler.js
  embed-application.js
  discourse/tests/active-plugins.js
  admin-plugins.js
  discourse/tests/test_starter.js
  }

if EmberCli.enabled?
  Rails.application.config.assets.precompile += %w{
      discourse.js
      test-support.js
      test-helpers.js
      scripts/discourse-test-listen-boot
      scripts/discourse-boot
    }
  Rails.application.config.assets.precompile += EmberCli::ASSETS.map { |name| name.sub('.js', '.map') }
else
  Rails.application.config.assets.precompile += %w{
    application.js
    discourse/tests/test-support-rails.js
    discourse/tests/test-helpers-rails.js
    vendor-theme-tests.js
  }
end

# Precompile all available locales
unless GlobalSetting.try(:omit_base_locales)
  Dir.glob("#{Rails.root}/app/assets/javascripts/locales/*.js.erb").each do |file|
    Rails.application.config.assets.precompile << "locales/#{file.match(/([a-z_A-Z]+\.js)\.erb$/)[1]}"
  end
end

# out of the box sprockets 3 grabs loose files that are hanging in assets,
# the exclusion list does not include hbs so you double compile all this stuff
Rails.application.config.assets.precompile.delete(Sprockets::Railtie::LOOSE_APP_ASSETS)

# We don't want application from node_modules, only from the root
Rails.application.config.assets.precompile.delete(/(?:\/|\\|\A)application\.(css|js)$/)
Rails.application.config.assets.precompile += ['application.js']

start_path = ::Rails.root.join("app/assets").to_s
exclude = ['.es6', '.hbs', '.hbr', '.js', '.css', '.lock', '.json', '.log', '.html', '']
Rails.application.config.assets.precompile << lambda do |logical_path, filename|
  filename.start_with?(start_path) &&
  !filename.include?("/node_modules/") &&
  !filename.include?("/dist/") &&
  !exclude.include?(File.extname(logical_path))
end

Discourse.find_plugin_js_assets(include_disabled: true).each do |file|
  Rails.application.config.assets.precompile << "#{file}.js"
end
