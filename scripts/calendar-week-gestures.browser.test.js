// Compatibility entrypoint: the transform/WAAPI pager was replaced by native
// scrolling. Exercise real touch/wheel input, snapping and absence of per-frame
// JavaScript handlers rather than testing the removed animation implementation.
require('./calendar-native-paging.browser.test.js');
