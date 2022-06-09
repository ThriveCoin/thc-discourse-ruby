import { module, test } from "qunit";
import Site from "discourse/models/site";
import createStore from "discourse/tests/helpers/create-store";

module("Unit | Model | site", function () {
  test("create", function (assert) {
    assert.ok(Site.create(), "it can create with no parameters");
  });

  test("instance", function (assert) {
    const site = Site.current();

    assert.present(site, "We have a current site singleton");
    assert.present(
      site.get("categories"),
      "The instance has a list of categories"
    );
    assert.present(
      site.get("flagTypes"),
      "The instance has a list of flag types"
    );
    assert.present(
      site.get("trustLevels"),
      "The instance has a list of trust levels"
    );
  });

  test("create categories", function (assert) {
    const store = createStore();
    const site = store.createRecord("site", {
      categories: [
        { id: 3456, name: "Test Subcategory", parent_category_id: 1234 },
        { id: 1234, name: "Test" },
        { id: 3458, name: "Invalid Subcategory", parent_category_id: 6666 },
      ],
    });

    assert.present(site.categories, "The categories are present");
    assert.deepEqual(site.categories.mapBy("name"), [
      "Test Subcategory",
      "Test",
      "Invalid Subcategory",
    ]);

    assert.deepEqual(site.sortedCategories.mapBy("name"), [
      "Test",
      "Test Subcategory",
    ]);

    const parent = site.categories.findBy("id", 1234);
    assert.present(parent, "it loaded the parent category");
    assert.blank(parent.parentCategory, "it has no parent category");

    assert.strictEqual(parent.subcategories.length, 1);

    const subcategory = site.categories.findBy("id", 3456);
    assert.present(subcategory, "it loaded the subcategory");
    assert.strictEqual(
      subcategory.parentCategory,
      parent,
      "it has associated the child with the parent"
    );

    // remove invalid category and child
    site.categories.removeObject(site.categories[2]);
    site.categories.removeObject(site.categories[0]);

    assert.strictEqual(
      site.categoriesByCount.length,
      site.categories.length,
      "categoriesByCount should change on removal"
    );
    assert.strictEqual(
      site.sortedCategories.length,
      site.categories.length,
      "sortedCategories should change on removal"
    );
  });

  test("deeply nested categories", function (assert) {
    const store = createStore();
    const site = store.createRecord("site", {
      categories: [
        { id: 1003, name: "Test Sub Sub", parent_category_id: 1002 },
        { id: 1001, name: "Test" },
        { id: 1004, name: "Test Sub Sub Sub", parent_category_id: 1003 },
        { id: 1002, name: "Test Sub", parent_category_id: 1001 },
        { id: 1005, name: "Test Sub Sub Sub2", parent_category_id: 1003 },
        { id: 1006, name: "Test2" },
      ],
    });

    assert.deepEqual(site.sortedCategories.mapBy("name"), [
      "Test",
      "Test Sub",
      "Test Sub Sub",
      "Test Sub Sub Sub",
      "Test Sub Sub Sub2",
      "Test2",
    ]);
  });
});
