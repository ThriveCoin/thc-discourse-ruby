import { isTesting } from "discourse-common/config/environment";
import { getAndClearUnhandledThemeErrors } from "discourse/app";
import getURL from "discourse-common/lib/get-url";
import I18n from "I18n";
import { bind } from "discourse-common/utils/decorators";
import { escape } from "pretty-text/sanitizer";
import identifySource, {
  consolePrefix,
  getThemeInfo,
} from "discourse/lib/source-identifier";

const showingErrors = new Set();

export default {
  name: "theme-errors-handler",
  after: "inject-discourse-objects",

  initialize(container) {
    if (isTesting()) {
      return;
    }

    this.currentUser = container.lookup("current-user:main");

    getAndClearUnhandledThemeErrors().forEach((e) => {
      reportThemeError(this.currentUser, e);
    });

    document.addEventListener("discourse-error", this.handleDiscourseError);
  },

  teardown() {
    document.removeEventListener("discourse-error", this.handleDiscourseError);
    delete this.currentUser;
  },

  @bind
  handleDiscourseError(e) {
    if (e.detail?.themeId) {
      reportThemeError(this.currentUser, e);
    } else {
      reportGenericError(this.currentUser, e);
    }
    e.preventDefault(); // Mark as handled
  },
};

function reportToLogster(name, error) {
  const data = {
    message: `${name} theme/component is throwing errors`,
    stacktrace: error.stack,
  };

  // TODO: To be moved out into a logster-provided lib
  // eslint-disable-next-line no-undef
  Ember.$.ajax(getURL("/logs/report_js_error"), {
    data,
    type: "POST",
  });
}

function reportThemeError(currentUser, e) {
  const { themeId, error } = e.detail;

  const source = {
    type: "theme",
    ...getThemeInfo(themeId),
  };

  reportToConsole(error, source);
  reportToLogster(source.name, error);

  const message = I18n.t("themes.broken_theme_alert");
  displayErrorNotice(currentUser, message, source);
}

function reportGenericError(currentUser, e) {
  const { messageKey, error } = e.detail;

  let message = I18n.t(messageKey);

  const source = identifySource(error);

  reportToConsole(error, source);

  if (messageKey && !showingErrors.has(messageKey)) {
    showingErrors.add(messageKey);
    displayErrorNotice(currentUser, message, source);
  }
}

function reportToConsole(error, source) {
  const prefix = consolePrefix(error, source);
  if (prefix) {
    /* eslint-disable-next-line no-console */
    console.error(prefix, error);
  } else {
    /* eslint-disable-next-line no-console */
    console.error(error);
  }
}

function displayErrorNotice(currentUser, message, source) {
  if (!currentUser?.admin) {
    return;
  }

  let html = `⚠️ ${message}`;

  if (source && source.type === "theme") {
    html += `<br/>${I18n.t("themes.error_caused_by", {
      name: escape(source.name),
      path: source.path,
    })}`;
  }

  html += `<br/><span class='theme-error-suffix'>${I18n.t(
    "themes.only_admins"
  )}</span>`;

  const alertDiv = document.createElement("div");
  alertDiv.classList.add("broken-theme-alert");
  alertDiv.innerHTML = html;
  document.body.prepend(alertDiv);
}
