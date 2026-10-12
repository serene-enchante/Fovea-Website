import assert from 'node:assert/strict';
import test from 'node:test';
import { renderSidebarOverview } from '../scripts/components/sidebar-overview-view.js';

function createElement() {
    return {
        style: {},
        listeners: {},
        attributes: {},
        addEventListener(name, handler) { this.listeners[name] = handler; },
        getAttribute(name) { return this.attributes[name]; }
    };
}

test('renders Florence overview bird previews and delegates preview actions', () => {
    const birdTile = Object.assign(createElement(), { attributes: { 'data-bird-name': 'Black Oystercatcher' } });
    const zoneTile = Object.assign(createElement(), { attributes: { 'data-zid': '01' } });
    const birdsFooter = createElement();
    const birdsHeader = createElement();
    const resourcesHeader = createElement();
    const image = Object.assign(createElement(), { src: '/zone.jpg' });
    const media = createElement();
    const root = {
        innerHTML: '',
        querySelectorAll: selector => selector === '.overview-preview-item--bird' ? [birdTile]
            : selector === '.overview-preview-item[data-zid]' ? [zoneTile] : [],
        querySelector: selector => ({
            '.sidebar-overview-preview__footer--birds': birdsFooter,
            '.sidebar-overview-preview__header--birds': birdsHeader,
            '.sidebar-overview-preview:not(.sidebar-overview-preview--birds) .sidebar-overview-preview__footer': null,
            '.sidebar-overview-people__header': null,
            '.sidebar-overview-resources__header': resourcesHeader,
            '.sidebar-about-media img': image,
            '.sidebar-about-media': media
        })[selector] || null
    };
    const appended = [];
    const actions = [];

    renderSidebarOverview({ appendChild: el => appended.push(el) }, {
        state: { currentFeature: 'florence', currentId: '02', circlesFeatures: [], allFeatures: [] },
        isCirclesFeature: false,
        isCircle: false,
        targetFeature: { properties: { zid: '01' } },
        onActivateTab: tab => actions.push(['tab', tab]),
        onSelectBird: name => actions.push(['bird', name]),
        onSelectZone: id => actions.push(['zone', id]),
        onFeatureHover: (id, hover) => actions.push(['hover', id, hover]),
        onOpenImageLightbox: (...args) => actions.push(['lightbox', ...args]),
        documentObject: { createElement: () => root }
    });

    assert.equal(appended[0], root);
    assert.match(root.innerHTML, /Black Oystercatcher/);
    birdTile.listeners.click();
    birdsFooter.listeners.click();
    birdsHeader.listeners.click();
    resourcesHeader.listeners.click();
    zoneTile.listeners.mouseenter();
    zoneTile.listeners.click();
    media.listeners.click();
    assert.deepEqual(actions.map(([kind, value]) => [kind, value]), [
        ['bird', 'Black Oystercatcher'], ['tab', 'birds'], ['tab', 'birds'], ['tab', 'resources'],
        ['hover', '01'], ['zone', '01'], ['lightbox', '/zone.jpg']
    ]);
});

test('renders all-circle previews with delegated selection and hover', () => {
    const tiles = ['Eugene', 'Oakridge'].map(cid => Object.assign(createElement(), { attributes: { 'data-cid': cid } }));
    const root = { innerHTML: '', querySelectorAll: () => tiles, querySelector: () => null };
    const appended = [];
    const actions = [];

    renderSidebarOverview({ appendChild: el => appended.push(el) }, {
        state: {
            currentFeature: 'circles',
            currentId: 'ecbc-circle',
            circlesFeatures: [{ properties: { cid: 'Eugene' } }, { properties: { cid: 'Oakridge' } }],
            allFeatures: []
        },
        isCirclesFeature: true,
        isCircle: false,
        targetFeature: null,
        onSelectCircle: id => actions.push(['circle', id]),
        onFeatureHover: (id, hover) => actions.push(['hover', id, hover]),
        documentObject: { createElement: () => root }
    });

    assert.match(root.innerHTML, /Count Circles/);
    tiles[0].listeners.mouseenter();
    tiles[0].listeners.click();
    assert.deepEqual(actions, [['hover', 'Eugene', true], ['circle', 'Eugene']]);
});
