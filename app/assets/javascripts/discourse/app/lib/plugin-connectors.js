import { buildRawConnectorCache } from "discourse-common/lib/raw-templates";
import deprecated from "discourse-common/lib/deprecated";

let _connectorCache;
let _rawConnectorCache;
let _extraConnectorClasses = {};
let _classPaths;

export function resetExtraClasses() {
  _extraConnectorClasses = {};
  _classPaths = undefined;
}

// Note: In plugins, define a class by path and it will be wired up automatically
// eg: discourse/connectors/<OUTLET NAME>/<CONNECTOR NAME>
export function extraConnectorClass(name, obj) {
  _extraConnectorClasses[name] = obj;
}

const DefaultConnectorClass = {
  actions: {},
  shouldRender: () => true,
  setupComponent() {},
  teardownComponent() {},
};

function findOutlets(collection, callback) {
  Object.keys(collection).forEach(function (res) {
    if (res.indexOf("/connectors/") !== -1) {
      const segments = res.split("/");
      let outletName = segments[segments.length - 2];
      const uniqueName = segments[segments.length - 1];

      callback(outletName, res, uniqueName);
    }
  });
}

export function clearCache() {
  _connectorCache = null;
  _rawConnectorCache = null;
}

function findClass(outletName, uniqueName) {
  if (!_classPaths) {
    _classPaths = {};
    findOutlets(require._eak_seen, (outlet, res, un) => {
      _classPaths[`${outlet}/${un}`] = requirejs(res).default;
    });
  }

  const id = `${outletName}/${uniqueName}`;
  let foundClass = _extraConnectorClasses[id] || _classPaths[id];

  return foundClass
    ? Object.assign({}, DefaultConnectorClass, foundClass)
    : DefaultConnectorClass;
}

function buildConnectorCache() {
  _connectorCache = {};

  // eslint-disable-next-line no-undef
  findOutlets(Ember.TEMPLATES, (outletName, resource, uniqueName) => {
    _connectorCache[outletName] = _connectorCache[outletName] || [];

    _connectorCache[outletName].push({
      outletName,
      templateName: resource.replace("javascripts/", ""),
      // eslint-disable-next-line no-undef
      template: Ember.TEMPLATES[resource],
      classNames: `${outletName}-outlet ${uniqueName}`,
      connectorClass: findClass(outletName, uniqueName),
    });
  });
}

export function connectorsFor(outletName) {
  if (!_connectorCache) {
    buildConnectorCache();
  }
  return _connectorCache[outletName] || [];
}

export function renderedConnectorsFor(outletName, args, context) {
  return connectorsFor(outletName).filter((con) => {
    return con.connectorClass.shouldRender(args, context);
  });
}

export function rawConnectorsFor(outletName) {
  if (!_rawConnectorCache) {
    _rawConnectorCache = buildRawConnectorCache(findOutlets);
  }
  return _rawConnectorCache[outletName] || [];
}

export function buildArgsWithDeprecations(args, deprecatedArgs) {
  const output = {};

  Object.keys(args).forEach((key) => {
    Object.defineProperty(output, key, { value: args[key] });
  });

  Object.keys(deprecatedArgs).forEach((key) => {
    Object.defineProperty(output, key, {
      get() {
        deprecated(`${key} is deprecated`);

        return deprecatedArgs[key];
      },
    });
  });

  return output;
}
