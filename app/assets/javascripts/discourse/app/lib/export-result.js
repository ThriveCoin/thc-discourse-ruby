import I18n from "I18n";
import bootbox from "bootbox";

export function outputExportResult(result) {
  if (result.success) {
    bootbox.alert(I18n.t("admin.export_csv.success"));
  } else {
    bootbox.alert(I18n.t("admin.export_csv.failed"));
  }
}
