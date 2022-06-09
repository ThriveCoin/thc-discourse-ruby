import { module, test } from "qunit";
import KeyValueStore from "discourse/lib/key-value-store";

module("Unit | Utility | key-value-store", function () {
  test("is able to get the result back from the store", function (assert) {
    const store = new KeyValueStore("test_");
    store.set({ key: "bob", value: "uncle" });

    assert.strictEqual(store.get("bob"), "uncle");
  });

  test("is able remove items from the store", function (assert) {
    const store = new KeyValueStore("test_");
    store.set({ key: "bob", value: "uncle" });
    store.remove("bob");

    assert.strictEqual(store.get("bob"), undefined);
  });

  test("is able to nuke the store", function (assert) {
    const store = new KeyValueStore("test_");
    store.set({ key: "bob1", value: "uncle" });
    store.abandonLocal();
    localStorage.a = 1;

    assert.strictEqual(store.get("bob1"), undefined);
    assert.strictEqual(localStorage.a, "1");
  });

  test("is API-compatible with `localStorage`", function (assert) {
    const store = new KeyValueStore("test_");
    store.setItem("bob", "uncle");
    assert.strictEqual(store.getItem("bob"), "uncle");

    store.removeItem("bob");
    assert.strictEqual(store.getItem("bob"), undefined);
  });
});
