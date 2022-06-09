import { DefaultNotificationItem } from "discourse/widgets/default-notification-item";
import I18n from "I18n";
import { createWidgetFrom } from "discourse/widgets/widget";
import { groupPath } from "discourse/lib/url";

createWidgetFrom(
  DefaultNotificationItem,
  "membership-request-accepted-notification-item",
  {
    url(data) {
      return groupPath(data.group_name);
    },

    text(notificationName, data) {
      return I18n.t(`notifications.${notificationName}`, {
        group_name: data.group_name,
      });
    },
  }
);
