import { module, test } from "qunit";
import AppEvents from "discourse/services/app-events";
import ArrayProxy from "@ember/array/proxy";
import Post from "discourse/models/post";
import { Promise } from "rsvp";
import User from "discourse/models/user";
import createStore from "discourse/tests/helpers/create-store";
import pretender from "discourse/tests/helpers/create-pretender";
import sinon from "sinon";

function buildStream(id, stream) {
  const store = createStore();
  const topic = store.createRecord("topic", { id, chunk_size: 5 });
  const ps = topic.get("postStream");
  if (stream) {
    ps.set("stream", stream);
  }
  ps.appEvents = AppEvents.create();
  return ps;
}

const participant = { username: "eviltrout" };

module("Unit | Model | post-stream", function () {
  test("create", function (assert) {
    const store = createStore();
    assert.ok(
      store.createRecord("postStream"),
      "it can be created with no parameters"
    );
  });

  test("defaults", function (assert) {
    const postStream = buildStream(1234);
    assert.blank(
      postStream.get("posts"),
      "there are no posts in a stream by default"
    );
    assert.ok(!postStream.get("loaded"), "it has never loaded");
    assert.present(postStream.get("topic"));
  });

  test("appending posts", function (assert) {
    const postStream = buildStream(4567, [1, 3, 4]);
    const store = postStream.store;

    assert.strictEqual(
      postStream.get("lastPostId"),
      4,
      "the last post id is 4"
    );

    assert.ok(!postStream.get("hasPosts"), "there are no posts by default");
    assert.ok(
      !postStream.get("firstPostPresent"),
      "the first post is not loaded"
    );
    assert.ok(!postStream.get("loadedAllPosts"), "the last post is not loaded");
    assert.strictEqual(
      postStream.get("posts.length"),
      0,
      "it has no posts initially"
    );

    postStream.appendPost(
      store.createRecord("post", { id: 2, post_number: 2 })
    );
    assert.ok(
      !postStream.get("firstPostPresent"),
      "the first post is still not loaded"
    );
    assert.strictEqual(
      postStream.get("posts.length"),
      1,
      "it has one post in the stream"
    );

    postStream.appendPost(
      store.createRecord("post", { id: 4, post_number: 4 })
    );
    assert.ok(
      !postStream.get("firstPostPresent"),
      "the first post is still loaded"
    );
    assert.ok(postStream.get("loadedAllPosts"), "the last post is now loaded");
    assert.strictEqual(
      postStream.get("posts.length"),
      2,
      "it has two posts in the stream"
    );

    postStream.appendPost(
      store.createRecord("post", { id: 4, post_number: 4 })
    );
    assert.strictEqual(
      postStream.get("posts.length"),
      2,
      "it will not add the same post with id twice"
    );

    const stagedPost = store.createRecord("post", { raw: "incomplete post" });
    postStream.appendPost(stagedPost);
    assert.strictEqual(
      postStream.get("posts.length"),
      3,
      "it can handle posts without ids"
    );
    postStream.appendPost(stagedPost);
    assert.strictEqual(
      postStream.get("posts.length"),
      3,
      "it won't add the same post without an id twice"
    );

    // change the stream
    postStream.set("stream", [1, 2, 4]);
    assert.ok(
      !postStream.get("firstPostPresent"),
      "the first post no longer loaded since the stream changed."
    );
    assert.ok(
      postStream.get("loadedAllPosts"),
      "the last post is still the last post in the new stream"
    );
  });

  test("closestPostNumberFor", function (assert) {
    const postStream = buildStream(1231);
    const store = postStream.store;

    assert.blank(
      postStream.closestPostNumberFor(1),
      "there is no closest post when nothing is loaded"
    );

    postStream.appendPost(
      store.createRecord("post", { id: 1, post_number: 2 })
    );
    postStream.appendPost(
      store.createRecord("post", { id: 2, post_number: 3 })
    );

    assert.strictEqual(
      postStream.closestPostNumberFor(2),
      2,
      "If a post is in the stream it returns its post number"
    );
    assert.strictEqual(
      postStream.closestPostNumberFor(3),
      3,
      "If a post is in the stream it returns its post number"
    );
    assert.strictEqual(
      postStream.closestPostNumberFor(10),
      3,
      "it clips to the upper bound of the stream"
    );
    assert.strictEqual(
      postStream.closestPostNumberFor(0),
      2,
      "it clips to the lower bound of the stream"
    );
  });

  test("closestDaysAgoFor", function (assert) {
    const postStream = buildStream(1231);
    postStream.set("timelineLookup", [
      [1, 10],
      [3, 8],
      [5, 1],
    ]);

    assert.strictEqual(postStream.closestDaysAgoFor(1), 10);
    assert.strictEqual(postStream.closestDaysAgoFor(2), 10);
    assert.strictEqual(postStream.closestDaysAgoFor(3), 8);
    assert.strictEqual(postStream.closestDaysAgoFor(4), 8);
    assert.strictEqual(postStream.closestDaysAgoFor(5), 1);

    // Out of bounds
    assert.strictEqual(postStream.closestDaysAgoFor(-1), 10);
    assert.strictEqual(postStream.closestDaysAgoFor(0), 10);
    assert.strictEqual(postStream.closestDaysAgoFor(10), 1);

    postStream.set("timelineLookup", []);
    assert.strictEqual(postStream.closestDaysAgoFor(1), undefined);
  });

  test("closestDaysAgoFor - empty", function (assert) {
    const postStream = buildStream(1231);
    postStream.set("timelineLookup", []);

    assert.strictEqual(postStream.closestDaysAgoFor(1), undefined);
  });

  test("updateFromJson", function (assert) {
    const postStream = buildStream(1231);

    postStream.updateFromJson({
      posts: [{ id: 1 }],
      stream: [1],
      extra_property: 12,
    });

    assert.strictEqual(
      postStream.get("posts.length"),
      1,
      "it loaded the posts"
    );
    assert.containsInstance(postStream.get("posts"), Post);

    assert.strictEqual(postStream.get("extra_property"), 12);
  });

  test("removePosts", function (assert) {
    const postStream = buildStream(10000001, [1, 2, 3]);
    const store = postStream.store;

    const p1 = store.createRecord("post", { id: 1, post_number: 2 }),
      p2 = store.createRecord("post", { id: 2, post_number: 3 }),
      p3 = store.createRecord("post", { id: 3, post_number: 4 });

    postStream.appendPost(p1);
    postStream.appendPost(p2);
    postStream.appendPost(p3);

    // Removing nothing does nothing
    postStream.removePosts();
    assert.strictEqual(postStream.get("posts.length"), 3);

    postStream.removePosts([p1, p3]);
    assert.strictEqual(postStream.get("posts.length"), 1);
    assert.deepEqual(postStream.get("stream"), [2]);
  });

  test("cancelFilter", function (assert) {
    const postStream = buildStream(1235);

    sinon.stub(postStream, "refresh").returns(Promise.resolve());

    postStream.set("filter", "summary");
    postStream.cancelFilter();
    assert.ok(!postStream.get("summary"), "summary is cancelled");

    postStream.filterParticipant(participant);
    postStream.cancelFilter();
    assert.blank(
      postStream.get("userFilters"),
      "cancelling the filters clears the userFilters"
    );
  });

  test("findPostIdForPostNumber", function (assert) {
    const postStream = buildStream(1234, [10, 20, 30, 40, 50, 60, 70]);
    postStream.set("gaps", { before: { 60: [55, 58] } });

    assert.strictEqual(
      postStream.findPostIdForPostNumber(500),
      undefined,
      "it returns undefined when the post cannot be found"
    );
    assert.strictEqual(
      postStream.findPostIdForPostNumber(1),
      10,
      "it finds the postId at the beginning"
    );
    assert.strictEqual(
      postStream.findPostIdForPostNumber(5),
      50,
      "it finds the postId in the middle"
    );
    assert.strictEqual(
      postStream.findPostIdForPostNumber(8),
      60,
      "it respects gaps"
    );
  });

  test("fillGapBefore", function (assert) {
    const postStream = buildStream(1234, [60]);
    sinon.stub(postStream, "findPostsByIds").returns(Promise.resolve([]));
    let post = postStream.store.createRecord("post", {
      id: 60,
      post_number: 60,
    });
    postStream.set("gaps", {
      before: { 60: [51, 52, 53, 54, 55, 56, 57, 58, 59] },
    });

    postStream.fillGapBefore(post, [51, 52, 53, 54, 55, 56, 57, 58, 59]);

    assert.deepEqual(
      postStream.stream,
      [51, 52, 53, 54, 55, 60],
      "partial results are included in the stream"
    );
  });

  test("filterParticipant", function (assert) {
    const postStream = buildStream(1236);
    sinon.stub(postStream, "refresh").returns(Promise.resolve());

    assert.strictEqual(
      postStream.get("userFilters.length"),
      0,
      "by default no participants are toggled"
    );

    postStream.filterParticipant(participant.username);
    assert.ok(
      postStream.get("userFilters").includes("eviltrout"),
      "eviltrout is in the filters"
    );

    postStream.cancelFilter();
    assert.blank(postStream.get("userFilters"), "cancelFilter clears");
  });

  test("filterReplies", function (assert) {
    const postStream = buildStream(1234),
      store = postStream.store;

    postStream.appendPost(
      store.createRecord("post", { id: 2, post_number: 3 })
    );

    sinon.stub(postStream, "refresh").returns(Promise.resolve());

    assert.strictEqual(
      postStream.get("filterRepliesToPostNumber"),
      false,
      "by default no replies are filtered"
    );

    postStream.filterReplies(3, 2);
    assert.strictEqual(
      postStream.get("filterRepliesToPostNumber"),
      3,
      "postNumber is in the filters"
    );

    postStream.cancelFilter();
    assert.strictEqual(
      postStream.get("filterRepliesToPostNumber"),
      false,
      "cancelFilter clears"
    );
  });

  test("filterUpwards", function (assert) {
    const postStream = buildStream(1234),
      store = postStream.store;

    postStream.appendPost(
      store.createRecord("post", { id: 2, post_number: 3 })
    );

    sinon.stub(postStream, "refresh").returns(Promise.resolve());

    assert.strictEqual(
      postStream.get("filterUpwardsPostID"),
      false,
      "by default filter is false"
    );

    postStream.filterUpwards(2);
    assert.strictEqual(
      postStream.get("filterUpwardsPostID"),
      2,
      "filter is set"
    );

    postStream.cancelFilter();
    assert.strictEqual(
      postStream.get("filterUpwardsPostID"),
      false,
      "filter cleared"
    );
  });

  test("streamFilters", function (assert) {
    const postStream = buildStream(1237);
    sinon.stub(postStream, "refresh").returns(Promise.resolve());

    assert.deepEqual(
      postStream.get("streamFilters"),
      {},
      "there are no postFilters by default"
    );
    assert.ok(
      postStream.get("hasNoFilters"),
      "there are no filters by default"
    );

    postStream.set("filter", "summary");
    assert.deepEqual(
      postStream.get("streamFilters"),
      { filter: "summary" },
      "postFilters contains the summary flag"
    );
    assert.ok(!postStream.get("hasNoFilters"), "now there are filters present");

    postStream.filterParticipant(participant.username);
    assert.deepEqual(
      postStream.get("streamFilters"),
      {
        username_filters: "eviltrout",
      },
      "streamFilters contains the username we filtered"
    );

    postStream.filterUpwards(2);
    assert.deepEqual(
      postStream.get("streamFilters"),
      {
        filter_upwards_post_id: 2,
      },
      "streamFilters contains only the post ID"
    );

    postStream.filterReplies(1);
    assert.deepEqual(
      postStream.get("streamFilters"),
      {
        replies_to_post_number: 1,
      },
      "streamFilters contains only the last filter"
    );
  });

  test("loading", function (assert) {
    let postStream = buildStream(1234);
    assert.ok(!postStream.get("loading"), "we're not loading by default");

    postStream.set("loadingAbove", true);
    assert.ok(postStream.get("loading"), "we're loading if loading above");

    postStream = buildStream(1234);
    postStream.set("loadingBelow", true);
    assert.ok(postStream.get("loading"), "we're loading if loading below");

    postStream = buildStream(1234);
    postStream.set("loadingFilter", true);
    assert.ok(postStream.get("loading"), "we're loading if loading a filter");
  });

  test("nextWindow", function (assert) {
    const postStream = buildStream(1234, [
      1,
      2,
      3,
      5,
      8,
      9,
      10,
      11,
      13,
      14,
      15,
      16,
    ]);

    assert.blank(
      postStream.get("nextWindow"),
      "With no posts loaded, the window is blank"
    );

    postStream.updateFromJson({ posts: [{ id: 1 }, { id: 2 }] });
    assert.deepEqual(
      postStream.get("nextWindow"),
      [3, 5, 8, 9, 10],
      "If we've loaded the first 2 posts, the window should be the 5 after that"
    );

    postStream.updateFromJson({ posts: [{ id: 13 }] });
    assert.deepEqual(
      postStream.get("nextWindow"),
      [14, 15, 16],
      "Boundary check: stop at the end."
    );

    postStream.updateFromJson({ posts: [{ id: 16 }] });
    assert.blank(
      postStream.get("nextWindow"),
      "Once we've seen everything there's nothing to load."
    );
  });

  test("previousWindow", function (assert) {
    const postStream = buildStream(1234, [
      1,
      2,
      3,
      5,
      8,
      9,
      10,
      11,
      13,
      14,
      15,
      16,
    ]);

    assert.blank(
      postStream.get("previousWindow"),
      "With no posts loaded, the window is blank"
    );

    postStream.updateFromJson({ posts: [{ id: 11 }, { id: 13 }] });
    assert.deepEqual(
      postStream.get("previousWindow"),
      [3, 5, 8, 9, 10],
      "If we've loaded in the middle, it's the previous 5 posts"
    );

    postStream.updateFromJson({ posts: [{ id: 3 }] });
    assert.deepEqual(
      postStream.get("previousWindow"),
      [1, 2],
      "Boundary check: stop at the beginning."
    );

    postStream.updateFromJson({ posts: [{ id: 1 }] });
    assert.blank(
      postStream.get("previousWindow"),
      "Once we've seen everything there's nothing to load."
    );
  });

  test("storePost", function (assert) {
    const postStream = buildStream(1234),
      store = postStream.store,
      post = store.createRecord("post", {
        id: 1,
        post_number: 100,
        raw: "initial value",
      });

    assert.blank(
      postStream.get("topic.highest_post_number"),
      "it has no highest post number yet"
    );
    let stored = postStream.storePost(post);
    assert.strictEqual(post, stored, "it returns the post it stored");
    assert.strictEqual(
      post.get("topic"),
      postStream.get("topic"),
      "it creates the topic reference properly"
    );
    assert.strictEqual(
      postStream.get("topic.highest_post_number"),
      100,
      "it set the highest post number"
    );

    const dupePost = store.createRecord("post", {
      id: 1,
      post_number: 100,
      raw: "updated value",
    });
    const storedDupe = postStream.storePost(dupePost);
    assert.strictEqual(
      storedDupe,
      post,
      "it returns the previously stored post instead to avoid dupes"
    );
    assert.strictEqual(
      storedDupe.get("raw"),
      "updated value",
      "it updates the previously stored post"
    );

    const postWithoutId = store.createRecord("post", { raw: "hello world" });
    stored = postStream.storePost(postWithoutId);
    assert.strictEqual(stored, postWithoutId, "it returns the same post back");
  });

  test("identity map", async function (assert) {
    const postStream = buildStream(1234);
    const store = postStream.store;

    const p1 = postStream.appendPost(
      store.createRecord("post", { id: 1, post_number: 1 })
    );
    const p3 = postStream.appendPost(
      store.createRecord("post", { id: 3, post_number: 4 })
    );

    assert.strictEqual(
      postStream.findLoadedPost(1),
      p1,
      "it can return cached posts by id"
    );
    assert.blank(postStream.findLoadedPost(4), "it can't find uncached posts");

    // Find posts by ids uses the identity map
    const result = await postStream.findPostsByIds([1, 2, 3]);
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result.objectAt(0), p1);
    assert.strictEqual(result.objectAt(1).get("post_number"), 2);
    assert.strictEqual(result.objectAt(2), p3);
  });

  test("loadIntoIdentityMap with no data", async function (assert) {
    const result = await buildStream(1234).loadIntoIdentityMap([]);
    assert.strictEqual(
      result.length,
      0,
      "requesting no posts produces no posts"
    );
  });

  test("loadIntoIdentityMap with post ids", async function (assert) {
    const postStream = buildStream(1234);
    await postStream.loadIntoIdentityMap([10]);

    assert.present(
      postStream.findLoadedPost(10),
      "it adds the returned post to the store"
    );
  });

  test("appendMore for megatopic", async function (assert) {
    const postStream = buildStream(1234);
    const store = createStore();
    const post = store.createRecord("post", { id: 1, post_number: 1 });

    postStream.setProperties({
      isMegaTopic: true,
      posts: [post],
    });

    await postStream.appendMore();
    assert.present(
      postStream.findLoadedPost(2),
      "it adds the returned post to the store"
    );

    assert.strictEqual(
      postStream.get("posts").length,
      6,
      "it adds the right posts into the stream"
    );
  });

  test("prependMore for megatopic", async function (assert) {
    const postStream = buildStream(1234);
    const store = createStore();
    const post = store.createRecord("post", { id: 6, post_number: 6 });

    postStream.setProperties({
      isMegaTopic: true,
      posts: [post],
    });

    await postStream.prependMore();
    assert.present(
      postStream.findLoadedPost(5),
      "it adds the returned post to the store"
    );

    assert.strictEqual(
      postStream.get("posts").length,
      6,
      "it adds the right posts into the stream"
    );
  });

  test("staging and undoing a new post", function (assert) {
    const postStream = buildStream(10101, [1]);
    const store = postStream.store;

    const original = store.createRecord("post", {
      id: 1,
      post_number: 1,
      topic_id: 10101,
    });
    postStream.appendPost(original);
    assert.strictEqual(
      postStream.get("lastAppended"),
      original,
      "the original post is lastAppended"
    );

    const user = User.create({
      username: "eviltrout",
      name: "eviltrout",
      id: 321,
    });
    const stagedPost = store.createRecord("post", {
      raw: "hello world this is my new post",
      topic_id: 10101,
    });

    const topic = postStream.get("topic");
    topic.setProperties({
      posts_count: 1,
      highest_post_number: 1,
    });

    // Stage the new post in the stream
    const result = postStream.stagePost(stagedPost, user);
    assert.strictEqual(result, "staged", "it returns staged");
    assert.strictEqual(
      topic.get("highest_post_number"),
      2,
      "it updates the highest_post_number"
    );
    assert.ok(
      postStream.get("loading"),
      "it is loading while the post is being staged"
    );
    assert.strictEqual(
      postStream.get("lastAppended"),
      original,
      "it doesn't consider staged posts as the lastAppended"
    );

    assert.strictEqual(
      topic.get("posts_count"),
      2,
      "it increases the post count"
    );
    assert.present(topic.get("last_posted_at"), "it updates last_posted_at");
    assert.strictEqual(
      topic.get("details.last_poster"),
      user,
      "it changes the last poster"
    );

    assert.strictEqual(
      stagedPost.get("topic"),
      topic,
      "it assigns the topic reference"
    );
    assert.strictEqual(
      stagedPost.get("post_number"),
      2,
      "it is assigned the probable post_number"
    );
    assert.present(
      stagedPost.get("created_at"),
      "it is assigned a created date"
    );
    assert.ok(
      postStream.get("posts").includes(stagedPost),
      "the post is added to the stream"
    );
    assert.strictEqual(
      stagedPost.get("id"),
      -1,
      "the post has a magical -1 id"
    );

    // Undoing a created post (there was an error)
    postStream.undoPost(stagedPost);

    assert.ok(!postStream.get("loading"), "it is no longer loading");
    assert.strictEqual(
      topic.get("highest_post_number"),
      1,
      "it reverts the highest_post_number"
    );
    assert.strictEqual(
      topic.get("posts_count"),
      1,
      "it reverts the post count"
    );
    assert.strictEqual(
      postStream.get("filteredPostsCount"),
      1,
      "it retains the filteredPostsCount"
    );
    assert.ok(
      !postStream.get("posts").includes(stagedPost),
      "the post is removed from the stream"
    );
    assert.strictEqual(
      postStream.get("lastAppended"),
      original,
      "it doesn't consider undid post lastAppended"
    );
  });

  test("staging and committing a post", function (assert) {
    const postStream = buildStream(10101, [1]);
    const store = postStream.store;

    const original = store.createRecord("post", {
      id: 1,
      post_number: 1,
      topic_id: 10101,
    });
    postStream.appendPost(original);
    assert.strictEqual(
      postStream.get("lastAppended"),
      original,
      "the original post is lastAppended"
    );

    const user = User.create({
      username: "eviltrout",
      name: "eviltrout",
      id: 321,
    });
    const stagedPost = store.createRecord("post", {
      raw: "hello world this is my new post",
      topic_id: 10101,
    });

    const topic = postStream.get("topic");
    topic.set("posts_count", 1);

    // Stage the new post in the stream
    let result = postStream.stagePost(stagedPost, user);
    assert.strictEqual(result, "staged", "it returns staged");

    assert.ok(
      postStream.get("loading"),
      "it is loading while the post is being staged"
    );
    stagedPost.setProperties({ id: 1234, raw: "different raw value" });

    result = postStream.stagePost(stagedPost, user);
    assert.strictEqual(
      result,
      "alreadyStaging",
      "you can't stage a post while it is currently staging"
    );
    assert.strictEqual(
      postStream.get("lastAppended"),
      original,
      "staging a post doesn't change the lastAppended"
    );

    postStream.commitPost(stagedPost);
    assert.ok(
      postStream.get("posts").includes(stagedPost),
      "the post is still in the stream"
    );
    assert.ok(!postStream.get("loading"), "it is no longer loading");

    assert.strictEqual(
      postStream.get("filteredPostsCount"),
      2,
      "it increases the filteredPostsCount"
    );

    const found = postStream.findLoadedPost(stagedPost.get("id"));
    assert.present(found, "the post is in the identity map");
    assert.ok(postStream.indexOf(stagedPost) > -1, "the post is in the stream");
    assert.strictEqual(
      found.get("raw"),
      "different raw value",
      "it also updated the value in the stream"
    );
    assert.strictEqual(
      postStream.get("lastAppended"),
      found,
      "committing a post changes lastAppended"
    );
  });

  test("loadedAllPosts when the id changes", function (assert) {
    // This can happen in a race condition between staging a post and it coming through on the
    // message bus. If the id of a post changes we should reconsider the loadedAllPosts property.
    const postStream = buildStream(10101, [1, 2]);
    const store = postStream.store;
    const postWithoutId = store.createRecord("post", {
      raw: "hello world this is my new post",
    });

    postStream.appendPost(
      store.createRecord("post", { id: 1, post_number: 1 })
    );
    postStream.appendPost(postWithoutId);
    assert.ok(!postStream.get("loadedAllPosts"), "the last post is not loaded");

    postWithoutId.set("id", 2);
    assert.ok(
      postStream.get("loadedAllPosts"),
      "the last post is loaded now that the post has an id"
    );
  });

  test("triggerRecoveredPost", async function (assert) {
    const postStream = buildStream(4567);
    const store = postStream.store;

    [1, 2, 3, 5].forEach((id) => {
      postStream.appendPost(
        store.createRecord("post", { id, post_number: id })
      );
    });

    const response = (object) => {
      return [200, { "Content-Type": "application/json" }, object];
    };

    pretender.get("/posts/4", () => {
      return response({ id: 4, post_number: 4 });
    });

    assert.strictEqual(
      postStream.get("postsWithPlaceholders.length"),
      4,
      "it should return the right length"
    );

    await postStream.triggerRecoveredPost(4);

    assert.strictEqual(
      postStream.get("postsWithPlaceholders.length"),
      5,
      "it should return the right length"
    );
  });

  test("committing and triggerNewPostsInStream race condition", function (assert) {
    const postStream = buildStream(4964);
    const store = postStream.store;

    postStream.appendPost(
      store.createRecord("post", { id: 1, post_number: 1 })
    );
    const user = User.create({
      username: "eviltrout",
      name: "eviltrout",
      id: 321,
    });
    const stagedPost = store.createRecord("post", {
      raw: "hello world this is my new post",
    });

    postStream.stagePost(stagedPost, user);
    assert.strictEqual(
      postStream.get("filteredPostsCount"),
      0,
      "it has no filteredPostsCount yet"
    );
    stagedPost.set("id", 123);

    sinon.stub(postStream, "appendMore");
    postStream.triggerNewPostsInStream([123]);
    assert.strictEqual(
      postStream.get("filteredPostsCount"),
      1,
      "it added the post"
    );

    postStream.commitPost(stagedPost);
    assert.strictEqual(
      postStream.get("filteredPostsCount"),
      1,
      "it does not add the same post twice"
    );
  });

  test("triggerNewPostInStream for ignored posts", async function (assert) {
    const postStream = buildStream(280, [1]);
    const store = postStream.store;
    User.resetCurrent(
      User.create({
        username: "eviltrout",
        name: "eviltrout",
        id: 321,
        ignored_users: ["ignoreduser"],
      })
    );

    postStream.appendPost(
      store.createRecord("post", { id: 1, post_number: 1 })
    );

    const post2 = store.createRecord("post", {
      id: 101,
      post_number: 2,
      username: "regularuser",
    });

    const post3 = store.createRecord("post", {
      id: 102,
      post_number: 3,
      username: "ignoreduser",
    });

    let stub = sinon
      .stub(postStream, "findPostsByIds")
      .returns(Promise.resolve([post2]));

    await postStream.triggerNewPostsInStream([101]);
    assert.strictEqual(
      postStream.posts.length,
      2,
      "it added the regular post to the posts"
    );
    assert.strictEqual(
      postStream.get("stream.length"),
      2,
      "it added the regular post to the stream"
    );

    stub.restore();
    sinon.stub(postStream, "findPostsByIds").returns(Promise.resolve([post3]));

    await postStream.triggerNewPostsInStream([102]);
    assert.strictEqual(
      postStream.posts.length,
      2,
      "it does not add the ignored post to the posts"
    );
    assert.strictEqual(
      postStream.stream.length,
      2,
      "it does not add the ignored post to the stream"
    );
  });

  test("postsWithPlaceholders", async function (assert) {
    const postStream = buildStream(4964, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const postsWithPlaceholders = postStream.get("postsWithPlaceholders");
    const store = postStream.store;

    const testProxy = ArrayProxy.create({ content: postsWithPlaceholders });

    const p1 = store.createRecord("post", { id: 1, post_number: 1 });
    const p2 = store.createRecord("post", { id: 2, post_number: 2 });
    const p3 = store.createRecord("post", { id: 3, post_number: 3 });
    const p4 = store.createRecord("post", { id: 4, post_number: 4 });

    postStream.appendPost(p1);
    postStream.appendPost(p2);
    postStream.appendPost(p3);

    // Test enumerable and array access
    assert.strictEqual(postsWithPlaceholders.get("length"), 3);
    assert.strictEqual(testProxy.get("length"), 3);
    assert.strictEqual(postsWithPlaceholders.nextObject(0), p1);
    assert.strictEqual(postsWithPlaceholders.objectAt(0), p1);
    assert.strictEqual(postsWithPlaceholders.nextObject(1, p1), p2);
    assert.strictEqual(postsWithPlaceholders.objectAt(1), p2);
    assert.strictEqual(postsWithPlaceholders.nextObject(2, p2), p3);
    assert.strictEqual(postsWithPlaceholders.objectAt(2), p3);

    const promise = postStream.appendMore();
    assert.strictEqual(
      postsWithPlaceholders.get("length"),
      8,
      "we immediately have a larger placeholder window"
    );
    assert.strictEqual(testProxy.get("length"), 8);
    assert.ok(!!postsWithPlaceholders.nextObject(3, p3));
    assert.ok(!!postsWithPlaceholders.objectAt(4));
    assert.ok(postsWithPlaceholders.objectAt(3) !== p4);
    assert.ok(testProxy.objectAt(3) !== p4);

    await promise;
    assert.strictEqual(postsWithPlaceholders.objectAt(3), p4);
    assert.strictEqual(
      postsWithPlaceholders.get("length"),
      8,
      "have a larger placeholder window when loaded"
    );
    assert.strictEqual(testProxy.get("length"), 8);
    assert.strictEqual(testProxy.objectAt(3), p4);
  });

  test("filteredPostsCount", function (assert) {
    const postStream = buildStream(4567, [1, 3, 4]);

    assert.strictEqual(postStream.get("filteredPostsCount"), 3);

    // Megatopic
    postStream.set("isMegaTopic", true);
    postStream.set("topic.highest_post_number", 4);

    assert.strictEqual(postStream.get("filteredPostsCount"), 4);
  });

  test("lastPostId", function (assert) {
    const postStream = buildStream(4567, [1, 3, 4]);

    assert.strictEqual(postStream.get("lastPostId"), 4);

    postStream.setProperties({
      isMegaTopic: true,
      lastId: 2,
    });

    assert.strictEqual(postStream.get("lastPostId"), 2);
  });

  test("progressIndexOfPostId", function (assert) {
    const postStream = buildStream(4567, [1, 3, 4]);
    const store = createStore();
    const post = store.createRecord("post", { id: 1, post_number: 5 });

    assert.strictEqual(postStream.progressIndexOfPostId(post), 1);

    postStream.set("isMegaTopic", true);

    assert.strictEqual(postStream.progressIndexOfPostId(post), 5);
  });
});
