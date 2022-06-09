import { helperContext, registerUnbound } from "discourse-common/lib/helpers";
import Category from "discourse/models/category";
import I18n from "I18n";
import Site from "discourse/models/site";
import { escapeExpression } from "discourse/lib/utilities";
import { get } from "@ember/object";
import getURL from "discourse-common/lib/get-url";
import { htmlSafe } from "@ember/template";
import { iconHTML } from "discourse-common/lib/icon-library";
import { isRTL } from "discourse/lib/text-direction";

let _renderer = defaultCategoryLinkRenderer;

export function replaceCategoryLinkRenderer(fn) {
  _renderer = fn;
}

function categoryStripe(color, classes) {
  let style = color ? "style='background-color: #" + color + ";'" : "";
  return "<span class='" + classes + "' " + style + "></span>";
}

let _extraIconRenderers = [];

export function addExtraIconRenderer(renderer) {
  _extraIconRenderers.push(renderer);
}

/**
  Generates category badge HTML

  @param {Object} category The category to generate the badge for.
  @param {Object} opts
    @param {String}  [opts.url] The url that we want the category badge to link to.
    @param {Boolean} [opts.allowUncategorized] If false, returns an empty string for the uncategorized category.
    @param {Boolean} [opts.link] If false, the category badge will not be a link.
    @param {Boolean} [opts.hideParent] If true, parent category will be hidden in the badge.
    @param {Boolean} [opts.recursive] If true, the function will be called recursively for all parent categories
    @param {Number}  [opts.depth] Current category depth, used for limiting recursive calls
**/
export function categoryBadgeHTML(category, opts) {
  let siteSettings = helperContext().siteSettings;
  opts = opts || {};

  if (
    !category ||
    (!opts.allowUncategorized &&
      get(category, "id") === Site.currentProp("uncategorized_category_id") &&
      siteSettings.suppress_uncategorized_badge)
  ) {
    return "";
  }

  const depth = (opts.depth || 1) + 1;
  if (opts.recursive && depth <= siteSettings.max_category_nesting) {
    const parentCategory = Category.findById(category.parent_category_id);
    const lastSubcategory = !opts.depth;
    opts.depth = depth;
    const parentBadges = categoryBadgeHTML(parentCategory, opts);
    opts.lastSubcategory = lastSubcategory;
    return parentBadges + _renderer(category, opts);
  }

  return _renderer(category, opts);
}

export function categoryLinkHTML(category, options) {
  let categoryOptions = {};

  // TODO: This is a compatibility layer with the old helper structure.
  // Can be removed once we migrate to `registerUnbound` fully
  if (options && options.hash) {
    options = options.hash;
  }

  if (options) {
    if (options.allowUncategorized) {
      categoryOptions.allowUncategorized = true;
    }
    if (options.link !== undefined) {
      categoryOptions.link = options.link;
    }
    if (options.extraClasses) {
      categoryOptions.extraClasses = options.extraClasses;
    }
    if (options.hideParent) {
      categoryOptions.hideParent = true;
    }
    if (options.categoryStyle) {
      categoryOptions.categoryStyle = options.categoryStyle;
    }
    if (options.recursive) {
      categoryOptions.recursive = true;
    }
  }
  return htmlSafe(categoryBadgeHTML(category, categoryOptions));
}

registerUnbound("category-link", categoryLinkHTML);

function buildTopicCount(count) {
  return `<span class="topic-count" aria-label="${I18n.t(
    "category_row.topic_count",
    { count }
  )}">&times; ${count}</span>`;
}

function defaultCategoryLinkRenderer(category, opts) {
  let descriptionText = get(category, "description_text");
  let restricted = get(category, "read_restricted");
  let url = opts.url
    ? opts.url
    : getURL(`/c/${Category.slugFor(category)}/${get(category, "id")}`);
  let href = opts.link === false ? "" : url;
  let tagName = opts.link === false || opts.link === "false" ? "span" : "a";
  let extraClasses = opts.extraClasses ? " " + opts.extraClasses : "";
  let color = get(category, "color");
  let html = "";
  let parentCat = null;
  let categoryDir = "";

  if (!opts.hideParent) {
    parentCat = Category.findById(get(category, "parent_category_id"));
  }

  let siteSettings = helperContext().siteSettings;

  const categoryStyle = opts.categoryStyle || siteSettings.category_style;
  if (categoryStyle !== "none") {
    if (parentCat && parentCat !== category) {
      html += categoryStripe(
        get(parentCat, "color"),
        "badge-category-parent-bg"
      );
    }
    html += categoryStripe(color, "badge-category-bg");
  }

  let classNames = "badge-category clear-badge";
  if (restricted) {
    classNames += " restricted";
  }

  let style = "";
  if (categoryStyle === "box") {
    style = `style="color: #${get(category, "text_color")};"`;
  }

  html +=
    `<span ${style} ` +
    'data-drop-close="true" class="' +
    classNames +
    '"' +
    (descriptionText ? 'title="' + descriptionText + '" ' : "") +
    ">";

  let categoryName = escapeExpression(get(category, "name"));

  if (siteSettings.support_mixed_text_direction) {
    categoryDir = isRTL(categoryName) ? 'dir="rtl"' : 'dir="ltr"';
  }

  if (restricted) {
    html += iconHTML("lock");
  }
  _extraIconRenderers.forEach((renderer) => {
    const iconName = renderer(category);
    if (iconName) {
      html += iconHTML(iconName);
    }
  });
  html += `<span class="category-name" ${categoryDir}>${categoryName}</span>`;
  html += "</span>";

  if (opts.topicCount && categoryStyle !== "box") {
    html += buildTopicCount(opts.topicCount);
  }

  if (href) {
    href = ` href="${href}" `;
  }

  extraClasses = categoryStyle ? categoryStyle + extraClasses : extraClasses;

  let afterBadgeWrapper = "";
  if (opts.topicCount && categoryStyle === "box") {
    afterBadgeWrapper += buildTopicCount(opts.topicCount);
  }
  if (opts.plusSubcategories && opts.lastSubcategory) {
    afterBadgeWrapper += `<span class="plus-subcategories">${I18n.t(
      "category_row.plus_subcategories",
      { count: opts.plusSubcategories }
    )}</span>`;
  }
  return `<${tagName} class="badge-wrapper ${extraClasses}" ${href}>${html}</${tagName}>${afterBadgeWrapper}`;
}
