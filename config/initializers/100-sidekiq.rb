# frozen_string_literal: true

require "sidekiq/pausable"
require 'sidekiq_logster_reporter'

Sidekiq.configure_client do |config|
  config.redis = Discourse.sidekiq_redis_config
end

Sidekiq.configure_server do |config|
  config.redis = Discourse.sidekiq_redis_config

  config.server_middleware do |chain|
    chain.add Sidekiq::Pausable
  end
end

if Sidekiq.server?

  module Sidekiq
    class CLI
      private

      def print_banner
        # banner takes up too much space
      end
    end
  end

  Rails.application.config.after_initialize do
    # defer queue should simply run in sidekiq
    Scheduler::Defer.async = false

    # warm up AR
    RailsMultisite::ConnectionManagement.safe_each_connection do
      (ActiveRecord::Base.connection.tables - %w[schema_migrations versions]).each do |table|
        table.classify.constantize.first rescue nil
      end
    end

    scheduler_hostname = ENV["UNICORN_SCHEDULER_HOSTNAME"]

    if !scheduler_hostname || scheduler_hostname.split(',').include?(Discourse.os_hostname)
      begin
        MiniScheduler.start(workers: GlobalSetting.mini_scheduler_workers)
      rescue MiniScheduler::DistributedMutex::Timeout
        sleep 5
        retry
      end
    end
  end
else
  # Sidekiq#logger= applies patches to whichever logger we pass it.
  # Therefore something like Sidekiq.logger = Rails.logger will break
  # all logging in the application.
  #
  # Instead, this patch adds a dedicated logger instance and patches
  # the #add method to forward messages to Rails.logger.
  Sidekiq.logger = Logger.new(nil)
  Sidekiq.logger.define_singleton_method(:add) do |severity, message = nil, progname = nil, &blk|
    Rails.logger.add(severity, message, progname, &blk)
  end
end

Sidekiq.error_handlers.clear
Sidekiq.error_handlers << SidekiqLogsterReporter.new

Sidekiq.strict_args!

Rails.application.config.to_prepare do
  # Ensure that scheduled jobs are loaded before mini_scheduler is configured.
  if Rails.env.development?
    Dir.glob("#{Rails.root}/app/jobs/scheduled/*.rb") do |f|
      require(f)
    end
  end

  MiniScheduler.configure do |config|
    config.redis = Discourse.redis

    config.job_exception_handler do |ex, context|
      Discourse.handle_job_exception(ex, context)
    end

    config.job_ran do |stat|
      DiscourseEvent.trigger(:scheduled_job_ran, stat)
    end

    config.skip_schedule { Sidekiq.paused? }

    config.before_sidekiq_web_request do
      RailsMultisite::ConnectionManagement.establish_connection(
        db: RailsMultisite::ConnectionManagement::DEFAULT
      )
    end
  end
end
