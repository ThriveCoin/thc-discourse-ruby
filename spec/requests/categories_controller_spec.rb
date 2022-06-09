# frozen_string_literal: true

describe CategoriesController do
  let(:admin) { Fabricate(:admin) }
  let!(:category) { Fabricate(:category, user: admin) }
  fab!(:user) { Fabricate(:user) }

  context 'index' do

    it 'web crawler view has correct urls for subfolder install' do
      set_subfolder "/forum"
      get '/categories', headers: { 'HTTP_USER_AGENT' => 'Googlebot' }
      html = Nokogiri::HTML5(response.body)
      expect(html.css('body.crawler')).to be_present
      expect(html.css("a[href=\"/forum/c/#{category.slug}/#{category.id}\"]")).to be_present
    end

    it "properly preloads topic list" do
      SiteSetting.categories_topics = 5
      SiteSetting.categories_topics.times { Fabricate(:topic) }
      get "/categories"

      expect(response.body).to have_tag("div#data-preloaded") do |element|
        json = JSON.parse(element.current_scope.attribute('data-preloaded').value)
        expect(json['topic_list_latest']).to include(%{"more_topics_url":"/latest"})
      end
    end

    it "Shows correct title if category list is set for homepage" do
      SiteSetting.top_menu = "categories|latest"
      get "/"

      expect(response.body).to have_tag "title", text: "Discourse"

      SiteSetting.short_site_description = "Official community"
      get "/"

      expect(response.body).to have_tag "title", text: "Discourse - Official community"
    end

    it "redirects /category paths to /c paths" do
      get "/category/uncategorized"
      expect(response.status).to eq(302)
      expect(response.body).to include("c/uncategorized")
    end

    it "respects permalinks before redirecting /category paths to /c paths" do
      _perm = Permalink.create!(url: "category/something", category_id: category.id)

      get "/category/something"
      expect(response.status).to eq(301)
      expect(response.body).to include(category.slug)
    end

    it 'returns the right response for a normal user' do
      sign_in(user)

      get "/categories.json"

      expect(response.status).to eq(200)

      category_list = response.parsed_body["category_list"]

      expect(category_list["categories"].map { |c| c["id"] }).to contain_exactly(
        SiteSetting.get(:uncategorized_category_id), category.id
      )
    end

    it 'does not returns subcatgories without permission' do
      subcategory = Fabricate(:category,  user: admin, parent_category: category)
      subcategory.set_permissions(admins: :full)
      subcategory.save!

      sign_in(user)

      get "/categories.json?include_subcategories=true"

      expect(response.status).to eq(200)

      category_list = response.parsed_body["category_list"]

      subcategories_for_category = category_list["categories"][1]["subcategory_list"]
      expect(subcategories_for_category).to eq(nil)
    end

    it 'returns the right subcategory response with permission' do
      subcategory = Fabricate(:category, user: admin, parent_category: category)

      sign_in(user)

      get "/categories.json?include_subcategories=true"

      expect(response.status).to eq(200)

      category_list = response.parsed_body["category_list"]

      subcategories_for_category = category_list["categories"][1]["subcategory_list"]
      expect(subcategories_for_category.count).to eq(1)
      expect(subcategories_for_category.first["parent_category_id"]).to eq(category.id)
      expect(subcategories_for_category.first["id"]).to eq(subcategory.id)
    end

    it 'does not return subcategories without query param' do
      subcategory = Fabricate(:category, user: admin, parent_category: category)

      sign_in(user)

      get "/categories.json"

      expect(response.status).to eq(200)

      category_list = response.parsed_body["category_list"]

      subcategories_for_category = category_list["categories"][1]["subcategory_list"]
      expect(subcategories_for_category).to eq(nil)
    end

    it 'includes topics for categories, subcategories and subsubcategories when requested' do
      SiteSetting.max_category_nesting = 3
      subcategory = Fabricate(:category, user: admin, parent_category: category)
      subsubcategory = Fabricate(:category, user: admin, parent_category: subcategory)

      topic1 = Fabricate(:topic, category: category)
      topic2 = Fabricate(:topic, category: subcategory)
      topic3 = Fabricate(:topic, category: subsubcategory)
      CategoryFeaturedTopic.feature_topics

      get "/categories.json?include_subcategories=true&include_topics=true"
      expect(response.status).to eq(200)

      category_list = response.parsed_body["category_list"]

      category_response = category_list["categories"].find { |c| c["id"] == category.id }
      expect(category_response["topics"].map { |c| c['id'] }).to contain_exactly(topic1.id)

      subcategory_response = category_response["subcategory_list"][0]
      expect(subcategory_response["topics"].map { |c| c['id'] }).to contain_exactly(topic2.id)

      subsubcategory_response = subcategory_response["subcategory_list"][0]
      expect(subsubcategory_response["topics"].map { |c| c['id'] }).to contain_exactly(topic3.id)
    end

    it 'includes subcategories and topics by default when view is subcategories_with_featured_topics' do
      SiteSetting.max_category_nesting = 3
      subcategory = Fabricate(:category, user: admin, parent_category: category)

      topic1 = Fabricate(:topic, category: category)
      CategoryFeaturedTopic.feature_topics

      SiteSetting.desktop_category_page_style = "subcategories_with_featured_topics"
      get "/categories.json"
      expect(response.status).to eq(200)

      category_list = response.parsed_body["category_list"]

      category_response = category_list["categories"].find { |c| c["id"] == category.id }
      expect(category_response["topics"].map { |c| c['id'] }).to contain_exactly(topic1.id)

      expect(category_response["subcategory_list"][0]["id"]).to eq(subcategory.id)
    end

    it "does not n+1 with multiple topics" do
      category1 = Fabricate(:category)
      category2 = Fabricate(:category)
      topic1 = Fabricate(:topic, category: category1)

      CategoryFeaturedTopic.feature_topics
      SiteSetting.desktop_category_page_style = "categories_with_featured_topics"

      # warmup
      get "/categories.json"
      expect(response.status).to eq(200)

      first_request_queries = track_sql_queries do
        get "/categories.json"
        expect(response.status).to eq(200)
      end

      category_response = response.parsed_body["category_list"]["categories"].find { |c| c["id"] == category1.id }
      expect(category_response["topics"].count).to eq(1)

      topic2 = Fabricate(:topic, category: category2)
      CategoryFeaturedTopic.feature_topics

      second_request_queries = track_sql_queries do
        get "/categories.json"
        expect(response.status).to eq(200)
      end

      category1_response = response.parsed_body["category_list"]["categories"].find { |c| c["id"] == category1.id }
      category2_response = response.parsed_body["category_list"]["categories"].find { |c| c["id"] == category2.id }
      expect(category1_response["topics"].size).to eq(1)
      expect(category2_response["topics"].size).to eq(1)

      expect(first_request_queries.count).to eq(second_request_queries.count)
    end

    it 'does not show uncategorized unless allow_uncategorized_topics' do
      SiteSetting.desktop_category_page_style = "categories_boxes_with_topics"

      uncategorized = Category.find(SiteSetting.uncategorized_category_id)
      Fabricate(:topic, category: uncategorized)
      CategoryFeaturedTopic.feature_topics

      SiteSetting.allow_uncategorized_topics = false

      get "/categories.json"
      expect(response.parsed_body["category_list"]["categories"].map { |x| x['id'] }).not_to include(uncategorized.id)
    end
  end

  context 'extensibility event' do
    before do
      sign_in(admin)
    end

    it "triggers a extensibility event" do
      event = DiscourseEvent.track_events {
        put "/categories/#{category.id}.json", params: {
          name: 'hello',
          color: 'ff0',
          text_color: 'fff'
        }
      }.last

      expect(event[:event_name]).to eq(:category_updated)
      expect(event[:params].first).to eq(category)
    end
  end

  context '#create' do
    it "requires the user to be logged in" do
      post "/categories.json"
      expect(response.status).to eq(403)
    end

    describe "logged in" do
      before do
        Jobs.run_immediately!
        sign_in(admin)
      end

      it "raises an exception when they don't have permission to create it" do
        sign_in(Fabricate(:user))
        post "/categories.json", params: {
          name: 'hello', color: 'ff0', text_color: 'fff'
        }

        expect(response).to be_forbidden
      end

      it "raises an exception when the name is missing" do
        post "/categories.json", params: { color: "ff0", text_color: "fff" }
        expect(response.status).to eq(400)
      end

      describe "failure" do
        it "returns errors on a duplicate category name" do
          category = Fabricate(:category, user: admin)

          post "/categories.json", params: {
            name: category.name, color: "ff0", text_color: "fff"
          }

          expect(response.status).to eq(422)
        end

        it "returns errors with invalid group" do
          category = Fabricate(:category, user: admin)
          readonly = CategoryGroup.permission_types[:readonly]

          post "/categories.json", params: {
            name: category.name, color: "ff0", text_color: "fff", permissions: { "invalid_group" => readonly }
          }

          expect(response.status).to eq(422)
          expect(response.parsed_body['errors']).to be_present
        end
      end

      describe "success" do
        it "works" do
          SiteSetting.enable_category_group_moderation = true

          readonly = CategoryGroup.permission_types[:readonly]
          create_post = CategoryGroup.permission_types[:create_post]
          group = Fabricate(:group)

          post "/categories.json", params: {
            name: "hello",
            color: "ff0",
            text_color: "fff",
            slug: "hello-cat",
            auto_close_hours: 72,
            search_priority: Searchable::PRIORITIES[:ignore],
            reviewable_by_group_name: group.name,
            permissions: {
              "everyone" => readonly,
              "staff" => create_post
            }
          }

          expect(response.status).to eq(200)
          cat_json = response.parsed_body['category']
          expect(cat_json).to be_present
          expect(cat_json['reviewable_by_group_name']).to eq(group.name)
          expect(cat_json['name']).to eq('hello')
          expect(cat_json['slug']).to eq('hello-cat')
          expect(cat_json['color']).to eq('ff0')
          expect(cat_json['auto_close_hours']).to eq(72)
          expect(cat_json['search_priority']).to eq(Searchable::PRIORITIES[:ignore])

          category = Category.find(cat_json['id'])
          expect(category.category_groups.map { |g| [g.group_id, g.permission_type] }.sort).to eq([
            [Group[:everyone].id, readonly], [Group[:staff].id, create_post]
          ])
          expect(UserHistory.count).to eq(4) # 1 + 3 (bootstrap mode)
        end
      end
    end
  end

  context '#show' do
    before do
      category.set_permissions(admins: :full)
      category.save!
    end

    it "requires the user to be logged in" do
      get "/c/#{category.id}/show.json"
      expect(response.status).to eq(403)
    end

    describe "logged in" do
      it "raises an exception if they don't have permission to see it" do
        admin.update!(admin: false, group_users: [])
        sign_in(admin)
        get "/c/#{category.id}/show.json"
        expect(response.status).to eq(403)
      end

      it "renders category for users that have permission" do
        sign_in(admin)
        get "/c/#{category.id}/show.json"
        expect(response.status).to eq(200)
      end
    end
  end

  context '#destroy' do
    it "requires the user to be logged in" do
      delete "/categories/category.json"
      expect(response.status).to eq(403)
    end

    describe "logged in" do
      it "raises an exception if they don't have permission to delete it" do
        admin.update!(admin: false)
        sign_in(admin)
        delete "/categories/#{category.slug}.json"
        expect(response).to be_forbidden
      end

      it "deletes the record" do
        sign_in(admin)

        id = Fabricate(:topic_timer, category: category).id

        expect do
          delete "/categories/#{category.slug}.json"
        end.to change(Category, :count).by(-1)
        expect(response.status).to eq(200)
        expect(UserHistory.count).to eq(1)
        expect(TopicTimer.where(id: id).exists?).to eq(false)
      end
    end
  end

  context '#reorder' do
    it "reorders the categories" do
      sign_in(admin)

      c1 = category
      c2 = Fabricate(:category)
      c3 = Fabricate(:category)
      c4 = Fabricate(:category)
      if c3.id < c2.id
        tmp = c3; c2 = c3; c3 = tmp
      end
      c1.position = 8
      c2.position = 6
      c3.position = 7
      c4.position = 5

      payload = {}
      payload[c1.id] = 4
      payload[c2.id] = 6
      payload[c3.id] = 6
      payload[c4.id] = 5

      post "/categories/reorder.json", params: { mapping: MultiJson.dump(payload) }

      SiteSetting.fixed_category_positions = true
      list = CategoryList.new(Guardian.new(admin))

      expect(list.categories).to eq([
        Category.find(SiteSetting.uncategorized_category_id),
        c1,
        c4,
        c2,
        c3
      ])
    end
  end

  context '#update' do
    before do
      Jobs.run_immediately!
    end

    it "requires the user to be logged in" do
      put "/categories/category.json"
      expect(response.status).to eq(403)
    end

    describe "logged in" do
      before do
        sign_in(admin)
      end

      it "raises an exception if they don't have permission to edit it" do
        sign_in(Fabricate(:user))
        put "/categories/#{category.slug}.json", params: {
          name: 'hello',
          color: 'ff0',
          text_color: 'fff'
        }
        expect(response).to be_forbidden
      end

      it "returns errors on a duplicate category name" do
        other_category = Fabricate(:category, name: "Other", user: admin)
        put "/categories/#{category.id}.json", params: {
          name: other_category.name,
          color: "ff0",
          text_color: "fff",
        }
        expect(response.status).to eq(422)
      end

      it "returns errors when there is a name conflict while moving a category into another" do
        parent_category = Fabricate(:category, name: "Parent", user: admin)
        other_category = Fabricate(:category, name: category.name, user: admin, parent_category: parent_category, slug: "a-different-slug")

        put "/categories/#{category.id}.json", params: {
          parent_category_id: parent_category.id,
        }

        expect(response.status).to eq(422)
      end

      it "returns 422 if email_in address is already in use for other category" do
        _other_category = Fabricate(:category, name: "Other", email_in: "mail@example.com")

        put "/categories/#{category.id}.json", params: {
          name: "Email",
          email_in: "mail@example.com",
          color: "ff0",
          text_color: "fff",
        }
        expect(response.status).to eq(422)
      end

      describe "success" do
        it "updates attributes correctly" do
          SiteSetting.tagging_enabled = true
          readonly = CategoryGroup.permission_types[:readonly]
          create_post = CategoryGroup.permission_types[:create_post]
          tag_group = Fabricate(:tag_group)

          put "/categories/#{category.id}.json", params: {
            name: "hello",
            color: "ff0",
            text_color: "fff",
            slug: "hello-category",
            auto_close_hours: 72,
            permissions: {
              "everyone" => readonly,
              "staff" => create_post
            },
            custom_fields: {
              "dancing" => "frogs"
            },
            minimum_required_tags: "",
            allow_global_tags: 'true',
            required_tag_groups: [{
              name: tag_group.name,
              min_count: 2
            }]
          }

          expect(response.status).to eq(200)
          category.reload
          expect(category.category_groups.map { |g| [g.group_id, g.permission_type] }.sort).to eq([
            [Group[:everyone].id, readonly], [Group[:staff].id, create_post]
          ])
          expect(category.name).to eq("hello")
          expect(category.slug).to eq("hello-category")
          expect(category.color).to eq("ff0")
          expect(category.auto_close_hours).to eq(72)
          expect(category.custom_fields).to eq("dancing" => "frogs")
          expect(category.minimum_required_tags).to eq(0)
          expect(category.allow_global_tags).to eq(true)
          expect(category.category_required_tag_groups.count).to eq(1)
          expect(category.category_required_tag_groups.first.tag_group.id).to eq(tag_group.id)
          expect(category.category_required_tag_groups.first.min_count).to eq(2)
        end

        it 'logs the changes correctly' do
          category.update!(permissions: { "admins" => CategoryGroup.permission_types[:create_post] })

          put "/categories/#{category.id}.json", params: {
            name: 'new name',
            color: category.color,
            text_color: category.text_color,
            slug: category.slug,
            permissions: {
              "everyone" => CategoryGroup.permission_types[:create_post]
            },
          }
          expect(response.status).to eq(200)
          expect(UserHistory.count).to eq(5) # 2 + 3 (bootstrap mode)
        end

        it 'updates per-category settings correctly' do
          category.custom_fields[Category::REQUIRE_TOPIC_APPROVAL] = false
          category.custom_fields[Category::REQUIRE_REPLY_APPROVAL] = false
          category.custom_fields[Category::NUM_AUTO_BUMP_DAILY] = 0

          category.navigate_to_first_post_after_read = false
          category.save!

          put "/categories/#{category.id}.json", params: {
            name: category.name,
            color: category.color,
            text_color: category.text_color,
            navigate_to_first_post_after_read: true,
            custom_fields: {
              require_reply_approval: true,
              require_topic_approval: true,
              num_auto_bump_daily: 10
            }
          }

          category.reload
          expect(category.require_topic_approval?).to eq(true)
          expect(category.require_reply_approval?).to eq(true)
          expect(category.num_auto_bump_daily).to eq(10)
          expect(category.navigate_to_first_post_after_read).to eq(true)
        end

        it "can remove required tag group" do
          SiteSetting.tagging_enabled = true
          category.update!(category_required_tag_groups: [ CategoryRequiredTagGroup.new(tag_group: Fabricate(:tag_group)) ])
          put "/categories/#{category.id}.json", params: {
            name: category.name,
            color: category.color,
            text_color: category.text_color,
            allow_global_tags: 'false',
            min_tags_from_required_group: 1,
            required_tag_groups: []
          }

          expect(response.status).to eq(200)
          category.reload
          expect(category.category_required_tag_groups).to be_empty
        end

        it "does not update other fields" do
          SiteSetting.tagging_enabled = true
          tag_group_1 = Fabricate(:tag_group)
          tag_group_2 = Fabricate(:tag_group)

          category.update!(
            allowed_tags: ["hello", "world"],
            allowed_tag_groups: [tag_group_1.name],
            category_required_tag_groups: [ CategoryRequiredTagGroup.new(tag_group: tag_group_2) ],
            custom_fields: { field_1: 'hello', field_2: 'hello' }
          )

          put "/categories/#{category.id}.json"
          expect(response.status).to eq(200)
          category.reload
          expect(category.tags.pluck(:name)).to contain_exactly("hello", "world")
          expect(category.tag_groups.pluck(:name)).to contain_exactly(tag_group_1.name)
          expect(category.category_required_tag_groups.first.tag_group).to eq(tag_group_2)
          expect(category.custom_fields).to eq({ 'field_1' => 'hello', 'field_2' => 'hello' })

          put "/categories/#{category.id}.json", params: { allowed_tags: [], custom_fields: { field_1: nil } }
          expect(response.status).to eq(200)
          category.reload
          expect(category.tags).to be_blank
          expect(category.tag_groups.pluck(:name)).to contain_exactly(tag_group_1.name)
          expect(category.category_required_tag_groups.first.tag_group).to eq(tag_group_2)
          expect(category.custom_fields).to eq({ 'field_2' => 'hello' })

          put "/categories/#{category.id}.json", params: { allowed_tags: [], allowed_tag_groups: [], required_tag_groups: [], custom_fields: { field_1: 'hi', field_2: nil } }
          expect(response.status).to eq(200)
          category.reload
          expect(category.tags).to be_blank
          expect(category.tag_groups).to be_blank
          expect(category.category_required_tag_groups).to eq([])
          expect(category.custom_fields).to eq({ 'field_1' => 'hi' })
        end
      end
    end
  end

  context '#update_slug' do
    it 'requires the user to be logged in' do
      put "/category/category/slug.json"
      expect(response.status).to eq(403)
    end

    describe 'logged in' do
      before do
        sign_in(admin)
      end

      it 'rejects blank' do
        put "/category/#{category.id}/slug.json", params: { slug: '   ' }
        expect(response.status).to eq(422)
        expect(response.parsed_body["errors"]).to eq(["Slug can't be blank"])
      end

      it 'accepts valid custom slug' do
        put "/category/#{category.id}/slug.json", params: { slug: 'valid-slug' }

        expect(response.status).to eq(200)
        expect(category.reload.slug).to eq('valid-slug')
      end

      it 'accepts not well formed custom slug' do
        put "/category/#{category.id}/slug.json", params: { slug: ' valid slug' }

        expect(response.status).to eq(200)
        expect(category.reload.slug).to eq('valid-slug')
      end

      it 'accepts and sanitize custom slug when the slug generation method is not ascii' do
        SiteSetting.slug_generation_method = 'none'
        put "/category/#{category.id}/slug.json", params: { slug: ' another !_ slug @' }

        expect(response.status).to eq(200)
        expect(category.reload.slug).to eq('another-slug')
        SiteSetting.slug_generation_method = 'ascii'
      end

      it 'rejects invalid custom slug' do
        put "/category/#{category.id}/slug.json", params: { slug: '.' }
        expect(response.status).to eq(422)
        expect(response.parsed_body["errors"]).to eq(["Slug is invalid"])
      end
    end
  end

  context '#categories_and_topics' do
    before do
      10.times.each { Fabricate(:topic) }
    end

    it 'works when SiteSetting.categories_topics is non-null' do
      SiteSetting.categories_topics = 5

      get '/categories_and_latest.json'
      expect(response.parsed_body['topic_list']['topics'].size).to eq(5)
    end

    it 'works when SiteSetting.categories_topics is null' do
      SiteSetting.categories_topics = 0

      get '/categories_and_latest.json'
      json = response.parsed_body

      category_list = json['category_list']
      topic_list = json['topic_list']

      expect(category_list['categories'].size).to eq(2) # 'Uncategorized' and category
      expect(topic_list['topics'].size).to eq(5)

      Fabricate(:category, parent_category: category)

      get '/categories_and_latest.json'
      json = response.parsed_body
      expect(json['category_list']['categories'].size).to eq(2)
      expect(json['topic_list']['topics'].size).to eq(5)

      Fabricate(:category)
      Fabricate(:category)

      get '/categories_and_latest.json'
      json = response.parsed_body
      expect(json['category_list']['categories'].size).to eq(4)
      expect(json['topic_list']['topics'].size).to eq(6)
    end

    it 'does not show uncategorized unless allow_uncategorized_topics' do
      uncategorized = Category.find(SiteSetting.uncategorized_category_id)
      Fabricate(:topic, category: uncategorized)
      CategoryFeaturedTopic.feature_topics

      SiteSetting.allow_uncategorized_topics = false

      get "/categories_and_latest.json"
      expect(response.parsed_body["category_list"]["categories"].map { |x| x['id'] }).not_to include(uncategorized.id)
    end

    describe 'Showing top topics from private categories' do
      it 'returns the top topic from the private category when the user is a member' do
        restricted_group = Fabricate(:group)
        private_cat = Fabricate(:private_category, group: restricted_group)
        private_topic = Fabricate(:topic, category: private_cat, like_count: 1000, posts_count: 100)
        TopTopic.refresh!
        restricted_group.add(user)
        sign_in(user)

        get "/categories_and_top.json"
        parsed_topic = response.parsed_body.dig('topic_list', 'topics').detect do |t|
          t.dig('id') == private_topic.id
        end

        expect(parsed_topic).to be_present
      end
    end
  end

  describe '#visible_groups' do
    fab!(:public_group) { Fabricate(:group, visibility_level: Group.visibility_levels[:public], name: 'aaa') }
    fab!(:private_group) { Fabricate(:group, visibility_level: Group.visibility_levels[:staff], name: 'bbb') }
    fab!(:user_only_group) { Fabricate(:group, visibility_level: Group.visibility_levels[:members], name: 'ccc') }

    it 'responds with 404 when id param is invalid' do
      get "/c/-9999/visible_groups.json"

      expect(response.status).to eq(404)
    end

    it "responds with 403 when category is restricted to the current user" do
      category.set_permissions(private_group.name => :full)
      category.save!

      get "/c/#{category.id}/visible_groups.json"

      expect(response.status).to eq(403)
    end

    it "returns the names of the groups that are visible to an admin" do
      sign_in(admin)

      category.set_permissions(
        private_group.name => :full,
        public_group.name => :full,
        user_only_group.name => :full,
      )

      category.save!

      get "/c/#{category.id}/visible_groups.json"

      expect(response.status).to eq(200)
      expect(response.parsed_body["groups"]).to eq([public_group.name, private_group.name, user_only_group.name])
    end

    it "returns the names of the groups that are visible to a user and excludes the everyone group" do
      private_group.add(user)
      sign_in(user)

      category.set_permissions(
        private_group.name => :full,
        public_group.name => :full,
        user_only_group.name => :full,
      )

      category.save!

      get "/c/#{category.id}/visible_groups.json"

      expect(response.status).to eq(200)
      expect(response.parsed_body["groups"]).to eq([public_group.name])
    end

    it "returns no groups if everyone can see it" do
      sign_in(user)

      category.set_permissions(
        "everyone" => :readonly,
        private_group.name => :full,
        public_group.name => :full,
        user_only_group.name => :full,
      )

      category.save!

      get "/c/#{category.id}/visible_groups.json"

      expect(response.status).to eq(200)
      expect(response.parsed_body["groups"]).to eq([])
    end
  end
end
