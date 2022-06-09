import Controller from "@ember/controller";
import { action } from "@ember/object";
import { not } from "@ember/object/computed";
import discourseComputed from "discourse-common/utils/decorators";
import { extractError } from "discourse/lib/ajax-error";
import { getNativeContact } from "discourse/lib/pwa-utils";
import { emailValid, hostnameValid } from "discourse/lib/utilities";
import { bufferedProperty } from "discourse/mixins/buffered-content";
import ModalFunctionality from "discourse/mixins/modal-functionality";
import Group from "discourse/models/group";
import Invite from "discourse/models/invite";
import I18n from "I18n";
import { FORMAT } from "select-kit/components/future-date-input-selector";
import { sanitize } from "discourse/lib/text";
import { timeShortcuts } from "discourse/lib/time-shortcut";

export default Controller.extend(
  ModalFunctionality,
  bufferedProperty("invite"),
  {
    allGroups: null,
    topics: null,

    flashText: null,
    flashClass: null,
    flashLink: false,

    invite: null,
    invites: null,

    editing: false,
    inviteToTopic: false,
    limitToEmail: false,

    @discourseComputed("buffered.emailOrDomain")
    isEmail(emailOrDomain) {
      return emailValid(emailOrDomain);
    },

    @discourseComputed("buffered.emailOrDomain")
    isDomain(emailOrDomain) {
      return hostnameValid(emailOrDomain);
    },

    isLink: not("isEmail"),

    onShow() {
      Group.findAll().then((groups) => {
        this.set("allGroups", groups.filterBy("automatic", false));
      });

      this.setProperties({
        topics: [],
        flashText: null,
        flashClass: null,
        flashLink: false,
        invite: null,
        invites: null,
        editing: false,
        inviteToTopic: false,
        limitToEmail: false,
      });

      this.setInvite(Invite.create());
      this.buffered.setProperties({
        max_redemptions_allowed: 1,
        expires_at: moment()
          .add(this.siteSettings.invite_expiry_days, "days")
          .format(FORMAT),
      });
    },

    onClose() {
      this.appEvents.trigger("modal-body:clearFlash");
    },

    setInvite(invite) {
      this.setProperties({ invite, topics: invite.topics });
    },

    save(opts) {
      const data = { ...this.buffered.buffer };

      if (data.emailOrDomain) {
        if (emailValid(data.emailOrDomain)) {
          data.email = data.emailOrDomain;
        } else if (hostnameValid(data.emailOrDomain)) {
          data.domain = data.emailOrDomain;
        }
        delete data.emailOrDomain;
      }

      if (data.groupIds !== undefined) {
        data.group_ids = data.groupIds.length > 0 ? data.groupIds : "";
        delete data.groupIds;
      }

      if (data.topicId !== undefined) {
        data.topic_id = data.topicId;
        delete data.topicId;
        delete data.topicTitle;
      }

      if (this.isLink) {
        if (this.invite.email) {
          data.email = data.custom_message = "";
        }
      } else if (this.isEmail) {
        if (this.invite.max_redemptions_allowed > 1) {
          data.max_redemptions_allowed = 1;
        }

        if (opts.sendEmail) {
          data.send_email = true;
          if (this.inviteToTopic) {
            data.invite_to_topic = true;
          }
        } else {
          data.skip_email = true;
        }
      }

      return this.invite
        .save(data)
        .then(() => {
          if (!this.invite.id) {
            return;
          }

          this.rollbackBuffer();

          if (
            this.invites &&
            !this.invites.any((i) => i.id === this.invite.id)
          ) {
            this.invites.unshiftObject(this.invite);
          }

          if (this.isEmail && opts.sendEmail) {
            this.send("closeModal");
          } else {
            this.setProperties({
              flashText: sanitize(I18n.t("user.invited.invite.invite_saved")),
              flashClass: "success",
              flashLink: !this.editing,
            });
          }
        })
        .catch((e) =>
          this.setProperties({
            flashText: sanitize(extractError(e)),
            flashClass: "error",
            flashLink: false,
          })
        );
    },

    @discourseComputed(
      "currentUser.staff",
      "siteSettings.invite_link_max_redemptions_limit",
      "siteSettings.invite_link_max_redemptions_limit_users"
    )
    maxRedemptionsAllowedLimit(staff, staffLimit, usersLimit) {
      return staff ? staffLimit : usersLimit;
    },

    @discourseComputed("buffered.expires_at")
    expiresAtLabel(expires_at) {
      const expiresAt = moment(expires_at);

      return expiresAt.isBefore()
        ? I18n.t("user.invited.invite.expired_at_time", {
            time: expiresAt.format("LLL"),
          })
        : I18n.t("user.invited.invite.expires_in_time", {
            time: moment.duration(expiresAt - moment()).humanize(),
          });
    },

    @discourseComputed("currentUser.staff", "currentUser.groups")
    canInviteToGroup(staff, groups) {
      return staff || groups.any((g) => g.owner);
    },

    @discourseComputed
    timeShortcuts() {
      const timezone = this.currentUser.timezone;
      const shortcuts = timeShortcuts(timezone);
      return [
        shortcuts.laterToday(),
        shortcuts.tomorrow(),
        shortcuts.laterThisWeek(),
        shortcuts.monday(),
        shortcuts.twoWeeks(),
        shortcuts.nextMonth(),
        shortcuts.twoMonths(),
        shortcuts.threeMonths(),
        shortcuts.fourMonths(),
        shortcuts.sixMonths(),
      ];
    },

    @action
    copied() {
      this.save({ sendEmail: false, copy: true });
    },

    @action
    saveInvite(sendEmail) {
      this.appEvents.trigger("modal-body:clearFlash");

      this.save({ sendEmail });
    },

    @action
    searchContact() {
      getNativeContact(this.capabilities, ["email"], false).then((result) => {
        this.set("buffered.email", result[0].email[0]);
      });
    },

    @action
    onChangeTopic(topicId, topic) {
      this.set("topics", [topic]);
      this.set("buffered.topicId", topicId);
    },
  }
);
