# frozen_string_literal: true

RSpec.describe BookmarkQuery do
  before do
    SearchIndexer.enable
  end

  fab!(:user) { Fabricate(:user) }
  let(:params) { {} }

  def bookmark_query(user: nil, params: nil)
    BookmarkQuery.new(user: user || self.user, params: params || self.params)
  end

  describe "#list_all" do
    before do
      Bookmark.reset_bookmarkables
      register_test_bookmarkable

      Fabricate(:topic_user, user: user, topic: post_bookmark.bookmarkable.topic)
      Fabricate(:topic_user, user: user, topic: topic_bookmark.bookmarkable)
      user_bookmark
    end

    let(:post_bookmark) { Fabricate(:bookmark, user: user, bookmarkable: Fabricate(:post)) }
    let(:topic_bookmark) { Fabricate(:bookmark, user: user, bookmarkable: Fabricate(:topic)) }
    let(:user_bookmark) { Fabricate(:bookmark, user: user, bookmarkable: Fabricate(:user, username: "bookmarkqueen")) }

    after do
      Bookmark.reset_bookmarkables
    end

    it "returns all the bookmarks for a user" do
      expect(bookmark_query.list_all.count).to eq(3)
    end

    it "does not return deleted bookmarkables" do
      post_bookmark.bookmarkable.trash!
      topic_bookmark.bookmarkable.trash!
      expect(bookmark_query.list_all.count).to eq(1)
    end

    it "runs the on_preload block provided passing in bookmarks" do
      preloaded_bookmarks = []
      BookmarkQuery.on_preload do |bookmarks, bq|
        (preloaded_bookmarks << bookmarks).flatten
      end
      bookmark_query.list_all
      expect(preloaded_bookmarks.any?).to eq(true)
    end

    it "returns a mixture of post, topic, and custom bookmarkable type bookmarks" do
      bookmarks = bookmark_query.list_all
      expect(bookmarks.map(&:id)).to match_array([post_bookmark.id, topic_bookmark.id, user_bookmark.id])
    end

    it "handles the user not having permission for all of the bookmarks of a certain bookmarkable" do
      UserTestBookmarkable.expects(:list_query).returns(nil)
      bookmarks = bookmark_query.list_all
      expect(bookmarks.map(&:id)).to match_array([post_bookmark.id, topic_bookmark.id])
    end

    it "handles the user not having permission to see any of their bookmarks" do
      topic_bookmark.bookmarkable.update(category: Fabricate(:private_category, group: Fabricate(:group)))
      post_bookmark.bookmarkable.topic.update(category: topic_bookmark.bookmarkable.category)
      UserTestBookmarkable.expects(:list_query).returns(nil)
      bookmarks = bookmark_query.list_all
      expect(bookmarks.map(&:id)).to eq([])
    end

    context "when q param is provided" do
      let!(:post) { Fabricate(:post, raw: "Some post content here", topic: Fabricate(:topic, title: "Bugfix game for devs")) }

      before do
        Bookmark.reset_bookmarkables
      end

      after do
        Bookmark.reset_bookmarkables
      end

      let(:bookmark3) { Fabricate(:bookmark, user: user, name: "Check up later", bookmarkable: Fabricate(:post)) }
      let(:bookmark4) { Fabricate(:bookmark, user: user, bookmarkable: post) }

      before do
        Fabricate(:topic_user, user: user, topic: bookmark3.bookmarkable.topic)
        Fabricate(:topic_user, user: user, topic: bookmark4.bookmarkable.topic)
      end

      it "can search by bookmark name" do
        bookmarks = bookmark_query(params: { q: 'check' }).list_all
        expect(bookmarks.map(&:id)).to eq([bookmark3.id])
      end

      it "can search by post content" do
        bookmarks = bookmark_query(params: { q: 'content' }).list_all
        expect(bookmarks.map(&:id)).to eq([bookmark4.id])
      end

      it "can search by topic title" do
        bookmarks = bookmark_query(params: { q: 'bugfix' }).list_all
        expect(bookmarks.map(&:id)).to eq([bookmark4.id])
      end

      context "with custom bookmarkable fitering" do
        before do
          register_test_bookmarkable
        end

        let!(:bookmark5) { Fabricate(:bookmark, user: user, bookmarkable: Fabricate(:user, username: "bookmarkking")) }

        it "allows searching bookmarkables by fields in other tables" do
          bookmarks = bookmark_query(params: { q: 'bookmarkk' }).list_all
          expect(bookmarks.map(&:id)).to eq([bookmark5.id])
        end
      end
    end

    context "for a whispered post" do
      before do
        post_bookmark.bookmarkable.update(post_type: Post.types[:whisper])
      end
      context "when the user is moderator" do
        it "does return the whispered post" do
          user.update!(moderator: true)
          expect(bookmark_query.list_all.count).to eq(3)
        end
      end
      context "when the user is admin" do
        it "does return the whispered post" do
          user.update!(admin: true)
          expect(bookmark_query.list_all.count).to eq(3)
        end
      end
      context "when the user is not staff" do
        it "does not return the whispered post" do
          expect(bookmark_query.list_all.count).to eq(2)
        end
      end
    end

    context "for a private message topic bookmark" do
      let(:pm_topic) { Fabricate(:private_message_topic) }
      before do
        post_bookmark.update(bookmarkable: Fabricate(:post, topic: pm_topic))
        TopicUser.change(user.id, pm_topic.id, total_msecs_viewed: 1)
      end

      context "when the user is a topic_allowed_user" do
        before do
          TopicAllowedUser.create(topic: pm_topic, user: user)
        end
        it "shows the user the bookmark in the PM" do
          expect(bookmark_query.list_all.map(&:id).count).to eq(3)
        end
      end

      context "when the user is in a topic_allowed_group" do
        before do
          group = Fabricate(:group)
          GroupUser.create(group: group, user: user)
          TopicAllowedGroup.create(topic: pm_topic, group: group)
        end
        it "shows the user the bookmark in the PM" do
          expect(bookmark_query.list_all.map(&:id).count).to eq(3)
        end
      end

      context "when the user is not a topic_allowed_user" do
        it "does not show the user a bookmarked post in a PM where they are not an allowed user" do
          expect(bookmark_query.list_all.map(&:id).count).to eq(2)
        end
      end

      context "when the user is not in a topic_allowed_group" do
        it "does not show the user a bookmarked post in a PM where they are not in an allowed group" do
          expect(bookmark_query.list_all.map(&:id).count).to eq(2)
        end
      end
    end

    context "when the topic category is private" do
      let(:group) { Fabricate(:group) }
      before do
        post_bookmark.bookmarkable.topic.update(category: Fabricate(:private_category, group: group))
        post_bookmark.reload
      end
      it "does not show the user a post/topic in a private category they cannot see" do
        expect(bookmark_query.list_all.map(&:id)).not_to include(post_bookmark.id)
      end
      it "does show the user a post/topic in a private category they can see" do
        GroupUser.create(user: user, group: group)
        expect(bookmark_query.list_all.map(&:id)).to include(post_bookmark.id)
      end
    end

    context "when the limit param is provided" do
      let(:params) { { limit: 1 } }
      it "is respected" do
        expect(bookmark_query.list_all.count).to eq(1)
      end
    end
  end

  describe "#list_all ordering" do
    let!(:bookmark1) { Fabricate(:bookmark, user: user, updated_at: 1.day.ago, reminder_at: nil) }
    let!(:bookmark2) { Fabricate(:bookmark, user: user, updated_at: 2.days.ago, reminder_at: nil) }
    let!(:bookmark3) { Fabricate(:bookmark, user: user, updated_at: 6.days.ago, reminder_at: nil) }
    let!(:bookmark4) { Fabricate(:bookmark, user: user, updated_at: 4.days.ago, reminder_at: nil) }
    let!(:bookmark5) { Fabricate(:bookmark, user: user, updated_at: 3.days.ago, reminder_at: nil) }

    before do
      [bookmark1, bookmark2, bookmark3, bookmark4, bookmark5].each do |bm|
        Fabricate(:topic_user, topic: bm.bookmarkable.topic, user: user)
        bm.reload
      end
    end

    it "order defaults to updated_at DESC" do
      expect(bookmark_query.list_all.map(&:id)).to eq([
        bookmark1.id,
        bookmark2.id,
        bookmark5.id,
        bookmark4.id,
        bookmark3.id
      ])
    end

    it "orders by reminder_at, then updated_at" do
      bookmark4.update_column(:reminder_at, 1.day.from_now)
      bookmark5.update_column(:reminder_at, 26.hours.from_now)

      expect(bookmark_query.list_all.map(&:id)).to eq([
        bookmark4.id,
        bookmark5.id,
        bookmark1.id,
        bookmark2.id,
        bookmark3.id
      ])
    end

    it "shows pinned bookmarks first ordered by reminder_at ASC then updated_at DESC" do
      bookmark3.update_column(:pinned, true)
      bookmark3.update_column(:reminder_at, 1.day.from_now)

      bookmark4.update_column(:pinned, true)
      bookmark4.update_column(:reminder_at, 28.hours.from_now)

      bookmark1.update_column(:pinned, true)
      bookmark2.update_column(:pinned, true)

      bookmark5.update_column(:reminder_at, 1.day.from_now)

      expect(bookmark_query.list_all.map(&:id)).to eq([
        bookmark3.id,
        bookmark4.id,
        bookmark1.id,
        bookmark2.id,
        bookmark5.id
      ])
    end
  end
end
