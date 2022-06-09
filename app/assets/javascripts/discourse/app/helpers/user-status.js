import I18n from "I18n";
import { escapeExpression } from "discourse/lib/utilities";
import { htmlHelper } from "discourse-common/lib/helpers";
import { iconHTML } from "discourse-common/lib/icon-library";

export default htmlHelper((user, args) => {
  if (!user) {
    return;
  }

  const name = escapeExpression(user.get("name"));
  let currentUser;
  if (args && args.hash) {
    currentUser = args.hash.currentUser;
  }

  if (currentUser && user.get("admin") && currentUser.get("staff")) {
    return iconHTML("shield-alt", {
      label: I18n.t("user.admin", { user: name }),
    });
  }
  if (user.get("moderator")) {
    return iconHTML("shield-alt", {
      label: I18n.t("user.moderator", { user: name }),
    });
  }
});
