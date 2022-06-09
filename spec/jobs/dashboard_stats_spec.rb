# frozen_string_literal: true

describe ::Jobs::DashboardStats do
  let(:group_message) { GroupMessage.new(Group[:admins].name, :dashboard_problems, limit_once_per: 7.days.to_i) }

  def clear_recently_sent!
    Discourse.redis.del(group_message.sent_recently_key)
  end

  after do
    clear_recently_sent!
  end

  it 'creates group message when problems are persistent for 2 days' do
    Discourse.redis.setex(AdminDashboardData.problems_started_key, 14.days.to_i, Time.zone.now.to_s)
    expect { described_class.new.execute({}) }.not_to change { Topic.count }

    Discourse.redis.setex(AdminDashboardData.problems_started_key, 14.days.to_i, 3.days.ago)
    expect { described_class.new.execute({}) }.to change { Topic.count }.by(1)
  end

  it 'replaces old message' do
    Discourse.redis.setex(AdminDashboardData.problems_started_key, 14.days.to_i, 3.days.ago)
    expect { described_class.new.execute({}) }.to change { Topic.count }.by(1)
    old_topic = Topic.last
    clear_recently_sent!

    new_topic = described_class.new.execute({}).topic
    expect(old_topic.reload.deleted_at.present?).to eq(true)
    expect(new_topic.reload.deleted_at).to be_nil
    expect(new_topic.title).to eq(old_topic.title)
  end

  it 'duplicates message if previous one has replies' do
    Discourse.redis.setex(AdminDashboardData.problems_started_key, 14.days.to_i, 3.days.ago)
    expect { described_class.new.execute({}) }.to change { Topic.count }.by(1)
    clear_recently_sent!

    _reply_1 = Fabricate(:post, topic: Topic.last)
    expect { described_class.new.execute({}) }.to change { Topic.count }.by(1)
  end

  it 'duplicates message if previous was 3 months ago' do
    freeze_time 3.months.ago do
      Discourse.redis.setex(AdminDashboardData.problems_started_key, 14.days.to_i, 3.days.ago)
      expect { described_class.new.execute({}) }.to change { Topic.count }.by(1)
      clear_recently_sent!
    end

    expect { described_class.new.execute({}) }.to change { Topic.count }.by(1)
  end
end
