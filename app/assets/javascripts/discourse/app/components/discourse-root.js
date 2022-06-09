import Component from "@ember/component";

let componentArgs = { tagName: "div" };

// TODO: Once we've moved to Ember CLI completely we can remove this block
// eslint-disable-next-line no-undef
if (!Ember.FEATURES.EMBER_GLIMMER_SET_COMPONENT_TEMPLATE) {
  componentArgs = { tagName: "" };
}

export default Component.extend(componentArgs);
