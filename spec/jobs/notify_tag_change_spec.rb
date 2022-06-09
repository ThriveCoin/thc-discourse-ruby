# frozen_string_literal: true

describe ::Jobs::NotifyTagChange do

  fab!(:user) { Fabricate(:user) }
  fab!(:regular_user) { Fabricate(:trust_level_4) }
  fab!(:post) { Fabricate(:post, user: regular_user) }
  fab!(:tag) { Fabricate(:tag, name: 'test') }

  it "creates notification for watched tag" do
    TagUser.create!(
      user_id: user.id,
      tag_id: tag.id,
      notification_level: NotificationLevels.topic_levels[:watching]
    )
    TopicTag.create!(
      topic_id: post.topic.id,
      tag_id: tag.id
    )

    expect { described_class.new.execute(post_id: post.id, notified_user_ids: [regular_user.id]) }.to change { Notification.count }
    notification = Notification.last
    expect(notification.user_id).to eq(user.id)
    expect(notification.topic_id).to eq(post.topic_id)
    expect(notification.notification_type).to eq(Notification.types[:posted])
  end

  it 'doesnt create notification for user watching category' do
    CategoryUser.create!(
      user_id: user.id,
      category_id: post.topic.category_id,
      notification_level: TopicUser.notification_levels[:watching]
    )
    expect { described_class.new.execute(post_id: post.id, notified_user_ids: [regular_user.id]) }.not_to change { Notification.count }
  end

  context 'hidden tag' do
    let!(:hidden_group) { Fabricate(:group, name: 'hidden_group') }
    let!(:hidden_tag_group) { Fabricate(:tag_group, name: 'hidden', permissions: [[hidden_group.id, :full]]) }
    let!(:topic_user) { Fabricate(:topic_user, user: user, topic: post.topic, notification_level: TopicUser.notification_levels[:watching]) }

    it 'does not create notification for watching user who does not belong to group' do
      TagGroupMembership.create!(tag_group_id: hidden_tag_group.id, tag_id: tag.id)

      expect { described_class.new.execute(post_id: post.id, notified_user_ids: [regular_user.id], diff_tags: [tag.name]) }.not_to change { Notification.count }

      Fabricate(:group_user, group: hidden_group, user: user)

      expect { described_class.new.execute(post_id: post.id, notified_user_ids: [regular_user.id], diff_tags: [tag.name]) }.to change { Notification.count }
    end

    it 'creates notification when at least added or removed tag is visible to everyone' do
      visible_tag = Fabricate(:tag, name: 'visible tag')
      visible_group = Fabricate(:tag_group, name: 'visible group')
      TagGroupMembership.create!(tag_group_id: visible_group.id, tag_id: visible_tag.id)
      TagGroupMembership.create!(tag_group_id: hidden_tag_group.id, tag_id: tag.id)

      expect { described_class.new.execute(post_id: post.id, notified_user_ids: [regular_user.id], diff_tags: [tag.name]) }.not_to change { Notification.count }
      expect { described_class.new.execute(post_id: post.id, notified_user_ids: [regular_user.id], diff_tags: [tag.name, visible_tag.name]) }.to change { Notification.count }
    end
  end
end
