import Component from "@ember/component";
import I18n from "I18n";
import { schedule } from "@ember/runloop";
import { action } from "@ember/object";

export default Component.extend({
  classNames: ["invite-list"],
  users: null,
  inviteEmail: "",
  inviteRole: "",
  invalid: false,

  init() {
    this._super(...arguments);
    this.set("users", []);

    this.set("roles", [
      { id: "moderator", label: I18n.t("wizard.invites.roles.moderator") },
      { id: "regular", label: I18n.t("wizard.invites.roles.regular") },
    ]);

    this.set("inviteRole", this.get("roles.0.id"));

    this.updateField();
  },

  keyPress(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      this.send("addUser");
    }
  },

  updateField() {
    const users = this.users;

    this.set("field.value", JSON.stringify(users));

    const staffCount = this.get("step.fieldsById.staff_count.value") || 1;
    const showWarning = staffCount < 3 && users.length === 0;

    this.set("field.warning", showWarning ? "invites.none_added" : null);
  },

  @action
  addUser() {
    const user = {
      email: this.inviteEmail || "",
      role: this.inviteRole,
    };

    if (!/(.+)@(.+){2,}\.(.+){2,}/.test(user.email)) {
      return this.set("invalid", true);
    }

    const users = this.users;
    if (users.findBy("email", user.email)) {
      return this.set("invalid", true);
    }

    this.set("invalid", false);

    users.pushObject(user);
    this.updateField();

    this.set("inviteEmail", "");
    schedule("afterRender", () =>
      this.element.querySelector(".invite-email").focus()
    );
  },

  @action
  removeUser(user) {
    this.users.removeObject(user);
    this.updateField();
  },
});
