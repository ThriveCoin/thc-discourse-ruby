import Theme, { COMPONENTS, THEMES } from "admin/models/theme";
import I18n from "I18n";
import componentTest, {
  setupRenderingTest,
} from "discourse/tests/helpers/component-test";
import {
  count,
  discourseModule,
  exists,
  query,
  queryAll,
} from "discourse/tests/helpers/qunit-helpers";
import hbs from "htmlbars-inline-precompile";
import { click, fillIn } from "@ember/test-helpers";

function createThemes(itemsCount, customAttributesCallback) {
  return [...Array(itemsCount)].map((_, i) => {
    const attrs = { name: `Theme ${i + 1}` };
    if (customAttributesCallback) {
      Object.assign(attrs, customAttributesCallback(i + 1));
    }
    return Theme.create(attrs);
  });
}

discourseModule("Integration | Component | themes-list", function (hooks) {
  setupRenderingTest(hooks);
  componentTest("current tab is themes", {
    template: hbs`{{themes-list themes=themes components=components currentTab=currentTab}}`,
    beforeEach() {
      this.themes = createThemes(5);
      this.components = createThemes(5, (n) => {
        return {
          name: `Child ${n}`,
          component: true,
          parentThemes: [this.themes[n - 1]],
          parent_themes: [1, 2, 3, 4, 5],
        };
      });
      this.setProperties({
        themes: this.themes,
        components: this.components,
        currentTab: THEMES,
      });
    },

    test(assert) {
      assert.strictEqual(
        queryAll(".themes-tab").hasClass("active"),
        true,
        "themes tab is active"
      );
      assert.strictEqual(
        queryAll(".components-tab").hasClass("active"),
        false,
        "components tab is not active"
      );

      assert.strictEqual(
        queryAll(".inactive-indicator").index(),
        -1,
        "there is no inactive themes separator when all themes are inactive"
      );
      assert.strictEqual(count(".themes-list-item"), 5, "displays all themes");

      [2, 3].forEach((num) => this.themes[num].set("user_selectable", true));
      this.themes[4].set("default", true);
      this.set("themes", this.themes);
      const names = [4, 2, 3, 0, 1].map((num) => this.themes[num].get("name")); // default theme always on top, followed by user-selectable ones and then the rest
      assert.deepEqual(
        Array.from(queryAll(".themes-list-item .name")).map((node) =>
          node.innerText.trim()
        ),
        names,
        "sorts themes correctly"
      );
      assert.strictEqual(
        queryAll(".inactive-indicator").index(),
        3,
        "the separator is in the right location"
      );

      this.themes.forEach((theme) => theme.set("user_selectable", true));
      this.set("themes", this.themes);
      assert.strictEqual(
        queryAll(".inactive-indicator").index(),
        -1,
        "there is no inactive themes separator when all themes are user-selectable"
      );

      this.set("themes", []);
      assert.strictEqual(
        count(".themes-list-item"),
        1,
        "shows one entry with a message when there is nothing to display"
      );
      assert.strictEqual(
        queryAll(".themes-list-item span.empty").text().trim(),
        I18n.t("admin.customize.theme.empty"),
        "displays the right message"
      );
    },
  });

  componentTest("current tab is components", {
    template: hbs`{{themes-list themes=themes components=components currentTab=currentTab}}`,
    beforeEach() {
      this.themes = createThemes(5);
      this.components = createThemes(5, (n) => {
        return {
          name: `Child ${n}`,
          component: true,
          parentThemes: [this.themes[n - 1]],
          parent_themes: [1, 2, 3, 4, 5],
        };
      });
      this.setProperties({
        themes: this.themes,
        components: this.components,
        currentTab: COMPONENTS,
      });
    },

    test(assert) {
      assert.strictEqual(
        queryAll(".components-tab").hasClass("active"),
        true,
        "components tab is active"
      );
      assert.strictEqual(
        queryAll(".themes-tab").hasClass("active"),
        false,
        "themes tab is not active"
      );

      assert.strictEqual(
        queryAll(".inactive-indicator").index(),
        -1,
        "there is no separator"
      );
      assert.strictEqual(
        count(".themes-list-item"),
        5,
        "displays all components"
      );

      this.set("components", []);
      assert.strictEqual(
        count(".themes-list-item"),
        1,
        "shows one entry with a message when there is nothing to display"
      );
      assert.strictEqual(
        queryAll(".themes-list-item span.empty").text().trim(),
        I18n.t("admin.customize.theme.empty"),
        "displays the right message"
      );
    },
  });

  componentTest(
    "themes filter is not visible when there are less than 10 themes",
    {
      template: hbs`{{themes-list themes=themes components=[] currentTab=currentTab}}`,

      beforeEach() {
        const themes = createThemes(9);
        this.setProperties({
          themes,
          currentTab: THEMES,
        });
      },
      async test(assert) {
        assert.ok(
          !exists(".themes-list-filter"),
          "filter input not shown when we have fewer than 10 themes"
        );
      },
    }
  );

  componentTest(
    "themes filter keeps themes whose names include the filter term",
    {
      template: hbs`{{themes-list themes=themes components=[] currentTab=currentTab}}`,

      beforeEach() {
        const themes = ["osama", "OsAmaa", "osAMA 1234"]
          .map((name) => Theme.create({ name: `Theme ${name}` }))
          .concat(createThemes(7));
        this.setProperties({
          themes,
          currentTab: THEMES,
        });
      },
      async test(assert) {
        assert.ok(exists(".themes-list-filter"));
        await fillIn(".themes-list-filter .filter-input", "  oSAma ");
        assert.deepEqual(
          Array.from(queryAll(".themes-list-item .name")).map((node) =>
            node.textContent.trim()
          ),
          ["Theme osama", "Theme OsAmaa", "Theme osAMA 1234"],
          "only themes whose names include the filter term are shown"
        );
      },
    }
  );

  componentTest(
    "switching between themes and components tabs keeps the filter visible only if both tabs have at least 10 items",
    {
      template: hbs`{{themes-list themes=themes components=components currentTab=currentTab}}`,

      beforeEach() {
        const themes = createThemes(10, (n) => {
          return { name: `Theme ${n}${n}` };
        });
        const components = createThemes(5, (n) => {
          return {
            name: `Component ${n}${n}`,
            component: true,
            parent_themes: [1],
            parentThemes: [1],
          };
        });
        this.setProperties({
          themes,
          components,
          currentTab: THEMES,
        });
      },
      async test(assert) {
        await fillIn(".themes-list-filter .filter-input", "11");
        assert.strictEqual(
          query(".themes-list-container").textContent.trim(),
          "Theme 11",
          "only 1 theme is shown"
        );
        await click(".themes-list-header .components-tab");
        assert.ok(
          !exists(".themes-list-filter"),
          "filter input/term do not persist when we switch to the other" +
            " tab because it has fewer than 10 items"
        );
        assert.deepEqual(
          Array.from(queryAll(".themes-list-item .name")).map((node) =>
            node.textContent.trim()
          ),
          [
            "Component 11",
            "Component 22",
            "Component 33",
            "Component 44",
            "Component 55",
          ],
          "all components are shown"
        );

        this.set(
          "components",
          this.components.concat(
            createThemes(5, (n) => {
              n += 5;
              return {
                name: `Component ${n}${n}`,
                component: true,
                parent_themes: [1],
                parentThemes: [1],
              };
            })
          )
        );
        assert.ok(
          exists(".themes-list-filter"),
          "filter is now shown for the components tab"
        );

        await fillIn(".themes-list-filter .filter-input", "66");
        assert.strictEqual(
          query(".themes-list-container").textContent.trim(),
          "Component 66",
          "only 1 component is shown"
        );

        await click(".themes-list-header .themes-tab");
        assert.strictEqual(
          query(".themes-list-container").textContent.trim(),
          "Theme 66",
          "filter term persisted between tabs because both have more than 10 items"
        );
      },
    }
  );
});
