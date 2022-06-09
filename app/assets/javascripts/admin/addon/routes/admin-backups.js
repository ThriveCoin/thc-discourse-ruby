import Backup from "admin/models/backup";
import BackupStatus from "admin/models/backup-status";
import DiscourseRoute from "discourse/routes/discourse";
import EmberObject from "@ember/object";
import I18n from "I18n";
import PreloadStore from "discourse/lib/preload-store";
import User from "discourse/models/user";
import { ajax } from "discourse/lib/ajax";
import bootbox from "bootbox";
import { extractError } from "discourse/lib/ajax-error";
import getURL from "discourse-common/lib/get-url";
import showModal from "discourse/lib/show-modal";

const LOG_CHANNEL = "/admin/backups/logs";

export default DiscourseRoute.extend({
  activate() {
    this.messageBus.subscribe(LOG_CHANNEL, (log) => {
      if (log.message === "[STARTED]") {
        User.currentProp("hideReadOnlyAlert", true);
        this.controllerFor("adminBackups").set(
          "model.isOperationRunning",
          true
        );
        this.controllerFor("adminBackupsLogs").get("logs").clear();
      } else if (log.message === "[FAILED]") {
        this.controllerFor("adminBackups").set(
          "model.isOperationRunning",
          false
        );
        bootbox.alert(
          I18n.t("admin.backups.operations.failed", {
            operation: log.operation,
          })
        );
      } else if (log.message === "[SUCCESS]") {
        User.currentProp("hideReadOnlyAlert", false);
        this.controllerFor("adminBackups").set(
          "model.isOperationRunning",
          false
        );
        if (log.operation === "restore") {
          // redirect to homepage when the restore is done (session might be lost)
          window.location = getURL("/");
        }
      } else {
        this.controllerFor("adminBackupsLogs")
          .get("logs")
          .pushObject(EmberObject.create(log));
      }
    });
  },

  model() {
    return PreloadStore.getAndRemove("operations_status", () =>
      ajax("/admin/backups/status.json")
    ).then((status) =>
      BackupStatus.create({
        isOperationRunning: status.is_operation_running,
        canRollback: status.can_rollback,
        allowRestore: status.allow_restore,
      })
    );
  },

  deactivate() {
    this.messageBus.unsubscribe(LOG_CHANNEL);
  },

  actions: {
    showStartBackupModal() {
      showModal("admin-start-backup", { admin: true });
      this.controllerFor("modal").set("modalClass", "start-backup-modal");
    },

    startBackup(withUploads) {
      this.transitionTo("admin.backups.logs");
      Backup.start(withUploads).then((result) => {
        if (!result.success) {
          bootbox.alert(result.message);
        }
      });
    },

    destroyBackup(backup) {
      bootbox.confirm(
        I18n.t("admin.backups.operations.destroy.confirm"),
        I18n.t("no_value"),
        I18n.t("yes_value"),
        (confirmed) => {
          if (confirmed) {
            backup
              .destroy()
              .then(() =>
                this.controllerFor("adminBackupsIndex")
                  .get("model")
                  .removeObject(backup)
              );
          }
        }
      );
    },

    startRestore(backup) {
      bootbox.confirm(
        I18n.t("admin.backups.operations.restore.confirm"),
        I18n.t("no_value"),
        I18n.t("yes_value"),
        (confirmed) => {
          if (confirmed) {
            this.transitionTo("admin.backups.logs");
            backup.restore();
          }
        }
      );
    },

    cancelOperation() {
      bootbox.confirm(
        I18n.t("admin.backups.operations.cancel.confirm"),
        I18n.t("no_value"),
        I18n.t("yes_value"),
        (confirmed) => {
          if (confirmed) {
            Backup.cancel().then(() => {
              this.controllerFor("adminBackups").set(
                "model.isOperationRunning",
                false
              );
            });
          }
        }
      );
    },

    rollback() {
      bootbox.confirm(
        I18n.t("admin.backups.operations.rollback.confirm"),
        I18n.t("no_value"),
        I18n.t("yes_value"),
        (confirmed) => {
          if (confirmed) {
            Backup.rollback().then((result) => {
              if (!result.success) {
                bootbox.alert(result.message);
              } else {
                // redirect to homepage (session might be lost)
                window.location = getURL("/");
              }
            });
          }
        }
      );
    },

    uploadSuccess(filename) {
      bootbox.alert(I18n.t("admin.backups.upload.success", { filename }));
    },

    uploadError(filename, message) {
      bootbox.alert(
        I18n.t("admin.backups.upload.error", { filename, message })
      );
    },

    remoteUploadSuccess() {
      Backup.find()
        .then((backups) => backups.map((backup) => Backup.create(backup)))
        .then((backups) => {
          this.controllerFor("adminBackupsIndex").set(
            "model",
            backups.map((backup) => Backup.create(backup))
          );
        })
        .catch((error) => {
          bootbox.alert(
            I18n.t("admin.backups.backup_storage_error", {
              error_message: extractError(error),
            })
          );
          return [];
        });
    },
  },
});
