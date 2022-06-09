# frozen_string_literal: true

##
# Allows us to query Bookmark records for lists. Used mainly
# in the user/activity/bookmarks page.

class BookmarkQuery
  def self.on_preload(&blk)
    (@preload ||= Set.new) << blk
  end

  def self.preload(bookmarks, object)
    preload_polymorphic_associations(bookmarks)
    if @preload
      @preload.each { |preload| preload.call(bookmarks, object) }
    end
  end

  # These polymorphic associations are loaded to make the UserBookmarkListSerializer's
  # life easier, which conditionally chooses the bookmark serializer to use based
  # on the type, and we want the associations all loaded ahead of time to make
  # sure we are not doing N+1s.
  def self.preload_polymorphic_associations(bookmarks)
    Bookmark.registered_bookmarkables.each do |registered_bookmarkable|
      registered_bookmarkable.perform_preload(bookmarks)
    end
  end

  def initialize(user:, guardian: nil, params: {})
    @user = user
    @params = params
    @guardian = guardian || Guardian.new(@user)
    @page = @params[:page].to_i
    @limit = @params[:limit].present? ? @params[:limit].to_i : @params[:per_page]
  end

  def list_all
    search_term = @params[:q]
    ts_query = search_term.present? ? Search.ts_query(term: search_term) : nil
    search_term_wildcard = search_term.present? ? "%#{search_term}%" : nil

    queries = Bookmark.registered_bookmarkables.map do |bookmarkable|
      interim_results = bookmarkable.perform_list_query(@user, @guardian)

      # this could occur if there is some security reason that the user cannot
      # access the bookmarkables that they have bookmarked, e.g. if they had 1 bookmark
      # on a topic and that topic was moved into a private category
      next if interim_results.blank?

      if search_term.present?
        interim_results = bookmarkable.perform_search_query(
          interim_results, search_term_wildcard, ts_query
        )
      end

      # this is purely to make the query easy to read and debug, otherwise it's
      # all mashed up into a massive ball in MiniProfiler :)
      "---- #{bookmarkable.model.to_s} bookmarkable ---\n\n #{interim_results.to_sql}"
    end.compact

    # same for interim results being blank, the user might have been locked out
    # from all their various bookmarks, in which case they will see nothing and
    # no further pagination/ordering/etc is required
    return [] if queries.empty?

    union_sql = queries.join("\n\nUNION\n\n")
    results = Bookmark.select("bookmarks.*").from("(\n\n#{union_sql}\n\n) as bookmarks")
    results = results.order(
      "(CASE WHEN bookmarks.pinned THEN 0 ELSE 1 END),
        bookmarks.reminder_at ASC,
        bookmarks.updated_at DESC"
    )

    if @page.positive?
      results = results.offset(@page * @params[:per_page])
    end

    results = results.limit(@limit).to_a
    BookmarkQuery.preload(results, self)
    results
  end
end
