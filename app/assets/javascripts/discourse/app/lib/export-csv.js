import I18n from "I18n";
import { ajax } from "discourse/lib/ajax";
import bootbox from "bootbox";
import { popupAjaxError } from "discourse/lib/ajax-error";

function exportEntityByType(type, entity, args) {
  return ajax("/export_csv/export_entity.json", {
    type: "POST",
    data: { entity, args },
  });
}

export function exportUserArchive() {
  return exportEntityByType("user", "user_archive")
    .then(function () {
      bootbox.alert(I18n.t("user.download_archive.success"));
    })
    .catch(popupAjaxError);
}

export function exportEntity(entity, args) {
  return exportEntityByType("admin", entity, args);
}
