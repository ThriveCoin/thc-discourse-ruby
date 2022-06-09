// discourse-skip-module
/*global document, Logster, QUnit */

//= require env
//= require jquery.debug
//= require ember.debug
//= require locales/i18n
//= require locales/en
//= require route-recognizer
//= require fake_xml_http_request
//= require pretender
//= require qunit
//= require ember-qunit
//= require discourse-loader
//= require jquery.debug
//= require handlebars
//= require ember-template-compiler
//= require wizard-application
//= require wizard-vendor
//= require_tree ./helpers
//= require_tree ./acceptance
//= require_tree ./models
//= require_tree ./components
//= require ./wizard-pretender
//= require test-shims

document.addEventListener("DOMContentLoaded", function () {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `
      <div id="ember-testing-container"><div id="ember-testing"></div></div>
      <style>#ember-testing-container { position: absolute; background: white; bottom: 0; right: 0; width: 640px; height: 384px; overflow: auto; z-index: 9999; border: 1px solid #ccc; } #ember-testing { zoom: 50%; }</style>
    `
  );
});

if (window.Logster) {
  Logster.enabled = false;
} else {
  window.Logster = { enabled: false };
}
// eslint-disable-next-line no-undef
Ember.Test.adapter = window.QUnitAdapter.create();

let createPretendServer = requirejs(
  "wizard/test/wizard-pretender",
  null,
  null,
  false
).default;

let server;

const queryParams = new URLSearchParams(window.location.search);

if (queryParams.get("qunit_disable_auto_start") === "1") {
  QUnit.config.autostart = false;
}

QUnit.testStart(function () {
  server = createPretendServer();
});

QUnit.testDone(function () {
  server.shutdown();
});

let _testApp = requirejs("wizard/test/helpers/start-app").default();
let _buildResolver = requirejs("discourse-common/resolver").buildResolver;
window.setResolver(_buildResolver("wizard").create({ namespace: _testApp }));

Object.keys(requirejs.entries).forEach(function (entry) {
  if (/\-test/.test(entry)) {
    requirejs(entry, null, null, true);
  }
});
