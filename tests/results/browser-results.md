# 浏览器测试结果

开始：2026-10-28T08:10:41.790Z
浏览器：152.0.7977.76
Playwright：1.64.1（playwright）

Actual unpacked Manifest V3 extension in an isolated browser profile, routed synthetic https://chatgpt.com and legacy-domain documents; no real ChatGPT connection or account access.

通过：28；失败：0。

| 测试 | 结果 | 耗时 |
| --- | --- | --- |
| actual-manifest-injection-and-user-only-index | PASS | 299 ms |
| rich-message-extraction-image-and-safe-literal-text | PASS | 189 ms |
| duplicate-text-distinct-targets-and-clone-deduplication | PASS | 655 ms |
| css-hidden-duplicate-rebinds-to-rendered-stable-target | PASS | 667 ms |
| search-chinese-case-insensitive-and-highlight | PASS | 207 ms |
| scroll-to-target-selection-and-transient-highlight | PASS | 2337 ms |
| smooth-scroll-animation-with-normal-motion-preference | PASS | 1788 ms |
| new-message-and-late-role-attribute-update | PASS | 499 ms |
| assistant-streaming-preserves-list-nodes-and-search | PASS | 1447 ms |
| spa-delayed-route-replacement-excludes-previous-chat | PASS | 2328 ms |
| spa-synchronous-route-and-dom-replacement | PASS | 318 ms |
| route-trailing-slash-preserves-message-identities | PASS | 1236 ms |
| new-chat-and-custom-gpt-url-promotion-preserves-messages | PASS | 2502 ms |
| equal-unkeyed-messages-never-guess-replacement-identity | PASS | 507 ms |
| recycled-virtual-node-cannot-redirect-old-entry | PASS | 324 ms |
| prepend-history-order-and-remounted-target | PASS | 897 ms |
| disjoint-virtual-windows-merge-by-reliable-turn-ordinals | PASS | 484 ms |
| missing-virtualized-target-honest-status-no-false-success | PASS | 1171 ms |
| explicit-history-loading-indexes-arriving-older-messages | PASS | 762 ms |
| history-load-cancellation-restores-scroll-position | PASS | 650 ms |
| escape-stops-explicit-history-loading | PASS | 240 ms |
| semantic-fallback-and-unknown-markup-status | PASS | 417 ms |
| collapse-expand-maintains-navigation-state | PASS | 264 ms |
| narrow-window-jump-collapses-panel-for-reading | PASS | 496 ms |
| responsive-light-dark-and-input-clearance | PASS | 1518 ms |
| long-conversation-200-users-no-initial-auto-scroll | PASS | 1433 ms |
| legacy-chat-openai-match-and-refresh | PASS | 255 ms |
| no-network-requests-or-persisted-conversation-content | PASS | 18 ms |

## 仍需人工验证

- Real signed-in ChatGPT DOM, branch/edit controls and website-specific virtualized history loading.
- Unpacked extension manual installation and UI behavior on current Chrome.
- Browser zoom, operating-system screen readers, touch/keyboard interaction and real-world long-session memory use.
