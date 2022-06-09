import Controller, { inject as controller } from "@ember/controller";
import { ajax } from "discourse/lib/ajax";
import discourseComputed from "discourse-common/utils/decorators";
import { equal, or } from "@ember/object/computed";
import { userPath } from "discourse/lib/url";

export default Controller.extend({
  application: controller(),

  showLoginButton: equal("model.path", "login"),
  anyButtons: or("showLoginButton", "showSignupButton"),

  @discourseComputed("model.path")
  bodyClass: (path) => `static-${path}`,

  @discourseComputed("model.path")
  showSignupButton() {
    return (
      this.get("model.path") === "login" && this.get("application.canSignUp")
    );
  },

  actions: {
    markFaqRead() {
      const currentUser = this.currentUser;
      if (currentUser) {
        ajax(userPath("read-faq"), { type: "POST" }).then(() => {
          currentUser.set("read_faq", true);
        });
      }
    },
  },
});
