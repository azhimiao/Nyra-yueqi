/**
 * Shared Memory / Diary gallery markup (App companion Memory tab).
 * Kept in sync with index.html [data-memory-gallery] body.
 */

export function memoryGalleryInnerHtml() {
  return `

            <header class="memory-relation-head memory-relation-head--slim">
              <h2 class="me-visually-hidden" data-i18n="memoryGallery.title">我们的记忆</h2>
              <p class="memory-relation-days" data-memory-together-label data-i18n="memoryGallery.togetherDayOne">在一起第 1 天</p>
              <div class="memory-relation-head__actions">
                <button type="button" class="memory-icon-btn" data-memory-search-toggle data-i18n-attr="aria-label:memoryGallery.search">
                  <i data-lucide="search"></i><span class="icon-fallback">⌕</span>
                </button>
                <button type="button" class="memory-avatar-btn" data-memory-open-character data-role-avatar data-i18n-attr="aria-label:pages.character" hidden>
                  <span class="role-avatar-fallback">角</span>
                </button>
              </div>
            </header>

            <div class="memory-search-panel" data-memory-search-panel hidden>
              <input type="search" data-memory-gallery-search data-i18n-attr="placeholder:memoryGallery.searchPlaceholder" placeholder="搜索日记与记忆" />
            </div>

            <section class="memory-week" data-memory-week aria-label="日历" data-i18n-attr="aria-label:memoryGallery.calendar">
              <button type="button" class="memory-week__label" data-memory-week-label data-memory-open-calendar data-i18n-attr="aria-label:memoryGallery.openCalendar" aria-label="打开完整日历"></button>
              <div class="memory-week__viewport" data-memory-week-viewport>
                <div class="memory-week__track" data-memory-week-track></div>
              </div>
              <div class="memory-month-sheet" data-memory-month-sheet hidden>
                <div class="memory-month-sheet__backdrop" data-memory-month-close></div>
                <div class="memory-month-sheet__panel" role="dialog" aria-modal="true" data-i18n-attr="aria-label:memoryGallery.fullCalendar">
                  <header class="memory-month-sheet__head">
                    <button type="button" class="memory-month-nav" data-memory-month-prev data-i18n-attr="aria-label:pages.companionChrome.diaryPrevMonth">‹</button>
                    <strong data-memory-month-title>—</strong>
                    <button type="button" class="memory-month-nav" data-memory-month-next data-i18n-attr="aria-label:pages.companionChrome.diaryNextMonth">›</button>
                    <button type="button" class="memory-month-close" data-memory-month-close data-i18n-attr="aria-label:common.close">×</button>
                  </header>
              <div class="memory-month-weekdays" data-memory-month-weekdays aria-hidden="true"></div>
                  <div class="memory-month-grid" data-memory-month-grid></div>
                  <button type="button" class="memory-month-today" data-memory-month-today data-i18n="memoryGallery.jumpToday">回到今天</button>
                </div>
              </div>
            </section>

            <section class="memory-feed" data-memory-feed aria-label="日记" data-i18n-attr="aria-label:memoryGallery.diary"></section>

            <section class="memory-recap" data-memory-recap hidden></section>

            <div class="memory-compose-sheet" data-memory-compose-sheet hidden aria-hidden="true">
              <div class="memory-compose-sheet__backdrop" data-memory-compose-close></div>
              <div class="memory-compose-sheet__panel" role="dialog" aria-modal="true" data-i18n-attr="aria-label:memoryGallery.composeTitle">
                <header class="memory-compose-sheet__head">
                  <strong data-i18n="memoryGallery.composeTitle">请ta写日记</strong>
                  <button type="button" class="memory-compose-close" data-memory-compose-close data-i18n-attr="aria-label:common.close">×</button>
                </header>
                <p class="memory-compose-sheet__hint" data-i18n="memoryGallery.composeHint">先选一种写法，再决定要不要配图。</p>
                <div class="diary-style-grid memory-compose-styles" data-memory-compose-styles role="radiogroup" data-i18n-attr="aria-label:memoryGallery.composeStylesAria"></div>
                <label class="memory-compose-image">
                  <input type="checkbox" data-memory-compose-image />
                  <span>
                    <strong data-i18n="memoryGallery.composeImage">生成日记配图</strong>
                    <em data-memory-compose-image-hint data-i18n="memoryGallery.composeImageHint">根据正文画一张封面场景</em>
                  </span>
                </label>
                <div class="memory-compose-footer">
                  <button type="button" class="memory-compose-confirm" data-memory-compose-confirm data-i18n="memoryGallery.composeConfirm">开始生成</button>
                </div>
              </div>
            </div>

            <section class="diary-book memory-diary-reader" data-diary-book hidden>
              <div class="diary-book-shell">
                <button type="button" class="diary-book-cover" data-diary-book-cover aria-expanded="false" hidden>
                  <div class="diary-book-cover-face">
                    <div class="diary-book-cover-frame">
                      <span class="diary-book-label" data-i18n="pages.companionChrome.diaryCoverBrand">月栖 · Diary</span>
                      <i class="diary-book-ornament" aria-hidden="true"></i>
                      <h3 data-i18n="pages.companionChrome.diaryBookTitle">日记本</h3>
                      <p data-diary-book-cover-meta>0 篇</p>
                      <span class="diary-book-tap-hint" data-i18n="pages.companionChrome.diaryTapOpen">轻触翻开</span>
                    </div>
                  </div>
                  <div class="diary-book-spine" aria-hidden="true"></div>
                </button>

                <div class="diary-book-interior" data-diary-book-interior>
                  <header class="diary-book-toolbar">
                    <button type="button" class="ghost-action" data-diary-book-close><i data-lucide="book-open"></i><span class="icon-fallback">↩</span><span data-i18n="pages.companionChrome.diaryClose">合上</span></button>
                    <div class="diary-book-toolbar-actions">
                      <button type="button" class="ghost-action" data-diary-generate><i data-lucide="sparkles"></i><span class="icon-fallback">✦</span><span data-i18n="pages.companionChrome.diaryGenerate">立即生成</span></button>
                    </div>
                  </header>

                  <div class="diary-book-index" data-diary-book-calendar data-i18n-attr="aria-label:phone.diary.calendarIndex">
                    <div class="diary-book-cal-head">
                      <button type="button" class="diary-cal-nav" data-diary-cal-prev data-i18n-attr="aria-label:pages.companionChrome.diaryPrevMonth">‹</button>
                      <strong data-diary-cal-title>—</strong>
                      <button type="button" class="diary-cal-nav" data-diary-cal-next data-i18n-attr="aria-label:pages.companionChrome.diaryNextMonth">›</button>
                    </div>
                    <div class="diary-book-cal-grid" data-diary-cal-grid></div>
                  </div>

                  <div class="diary-book-stage" data-diary-book-stage>
                    <button type="button" class="diary-page-turn diary-page-turn-prev" data-diary-page-prev data-i18n-attr="aria-label:pages.companionChrome.diaryPrevPage">‹</button>
                    <div class="diary-flip-book" data-diary-flip-book aria-live="polite"></div>
                    <button type="button" class="diary-page-turn diary-page-turn-next" data-diary-page-next data-i18n-attr="aria-label:pages.companionChrome.diaryNextPage">›</button>
                  </div>

                  <footer class="diary-page-footer" data-diary-page-footer hidden>
                    <span data-diary-page-indicator>0 / 0</span>
                    <div class="diary-page-actions">
                      <button type="button" data-diary-page-edit data-i18n="pages.companionChrome.diaryEdit">编辑</button>
                      <button type="button" data-diary-page-delete data-i18n="pages.companionChrome.diaryDelete">删除</button>
                    </div>
                  </footer>
                </div>
              </div>
            </section>
  `;
}
