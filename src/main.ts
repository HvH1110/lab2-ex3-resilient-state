import './styles.css';
import { createDataFeedApp } from './data-feed';
import { createFeedFetcher } from './feed-service';
import { auditMount, inspectStateStore, renderApp } from './mini-react';
import { verifyViewState } from './view-state';

const root = document.getElementById('app');
if (root === null) throw new Error('Mount target #app not found');

let commits = 0;

renderApp(createDataFeedApp({ fetcherFor: (scenario) => createFeedFetcher(scenario) }), root, {
  // Checkpoint verification after every state change, visible in the DevTools Console.
  onCommit: (tree, container) => {
    commits++;
    const report = auditMount(tree, container);
    const [, viewState] = inspectStateStore().states;
    console.assert(report.ok, 'VNode/DOM parity audit failed', report.issues);
    console.assert(verifyViewState(viewState), 'impossible view state', viewState);
    console.assert(container.querySelector('div, span') === null, 'div-soup detected');
    console.info(
      `[commit #${commits}] ${container.querySelector('[data-status]')?.getAttribute('data-status')} · audit ${report.ok ? 'PASS' : 'FAIL'}: ${report.vnodeCount} VNodes ↔ ${report.domNodeCount} DOM nodes`,
      viewState,
    );
  },
});
