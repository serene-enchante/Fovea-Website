import { activateDeferredImages } from '../utils/deferred-images.js';

export function createDownloadWizardStepper({
    state,
    disposeRasterCache = () => {},
    documentObject = globalThis.document,
    windowObject = globalThis.window,
    resolveAssetPath = path => path,
    escapeHtml = value => String(value ?? '')
}) {
    function setStep(stepNum) {
        if (stepNum < 3) disposeRasterCache();

        state.currentStep = stepNum;

        documentObject.querySelectorAll('.wizard-step-view').forEach(view => view.classList.remove('is-visible'));
        const targetView = documentObject.getElementById(`step-${stepNum}-view`);
        if (targetView) {
            targetView.classList.add('is-visible');
            if (stepNum === 3) activateDeferredImages(targetView);
        }

        updateStepperUI();
        windowObject.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function updateStepperUI() {
        const stepNum = state.currentStep;

        documentObject.querySelectorAll('.stepper-step').forEach(node => {
            const nodeStep = parseInt(node.dataset.step, 10);
            node.classList.remove('is-active', 'is-completed', 'has-logo', 'is-selected-zone');
            const nodeEl = node.querySelector('.stepper-step__node');
            const labelEl = node.querySelector('.stepper-step__label');

            if (nodeStep === 1) {
                if (state.selectedCircle) {
                    if (labelEl) labelEl.textContent = state.selectedCircle.name;
                    node.classList.add('has-logo');
                    if (nodeEl) {
                        nodeEl.innerHTML = `<img src="${resolveAssetPath(state.selectedCircle.thumbnail)}" alt="${escapeHtml(state.selectedCircle.name)}">`;
                    }
                } else {
                    if (labelEl) labelEl.textContent = 'chose count circle';
                    if (nodeEl) nodeEl.textContent = '1';
                }
            } else if (nodeStep === 2) {
                if (state.selectedZone !== null) {
                    const zid = state.selectedZone?.properties?.zid;
                    const displayZid = zid ? String(zid).padStart(2, '0') : '00';
                    if (labelEl) labelEl.textContent = `Zone ${displayZid}`;
                    node.classList.add('is-selected-zone');
                    if (nodeEl) {
                        nodeEl.innerHTML = `<span style="font-size: 0.76rem; font-weight: 800; color: #000000; line-height: 1;">${displayZid}</span>`;
                    }
                } else if (state.currentStep === 3 && state.selectedCircle) {
                    if (labelEl) labelEl.textContent = 'full circle';
                    node.classList.add('is-selected-zone');
                    if (nodeEl) {
                        nodeEl.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5"><circle cx="12" cy="12" r="9"></circle></svg>';
                    }
                } else {
                    if (labelEl) labelEl.textContent = 'select zone';
                    if (nodeEl) nodeEl.textContent = '2';
                }
            } else if (nodeStep === 3) {
                if (labelEl) labelEl.textContent = 'download files';
                if (nodeEl) nodeEl.textContent = '3';
            }

            if (nodeStep === stepNum) node.classList.add('is-active');
            else if (nodeStep < stepNum) node.classList.add('is-completed');
        });

        const trackProgress = documentObject.getElementById('stepper-track-progress');
        if (trackProgress) {
            const progressWidths = { 1: '0%', 2: '50%', 3: '100%' };
            trackProgress.style.width = progressWidths[stepNum] || '0%';
        }
    }

    function setup() {
        documentObject.querySelectorAll('.stepper-step').forEach(node => {
            node.addEventListener('click', () => {
                const stepNum = parseInt(node.dataset.step, 10);
                if (stepNum === 1) setStep(1);
                else if (stepNum === 2 && state.selectedCircle && state.selectedCircle.totalZones > 0) setStep(2);
                else if (stepNum === 3 && state.selectedCircle && (state.selectedZone !== null || state.currentStep === 3)) setStep(3);
            });
        });

        documentObject.querySelectorAll('.wizard-back-btn').forEach(button => {
            button.addEventListener('click', () => {
                const targetStep = parseInt(button.dataset.targetStep, 10) || state.currentStep - 1;
                if (targetStep >= 1) setStep(targetStep);
            });
        });

        const changeButton = documentObject.getElementById('wizard-change-selection-btn');
        if (changeButton) {
            changeButton.addEventListener('click', () => {
                setStep(state.selectedCircle && state.selectedCircle.totalZones > 0 ? 2 : 1);
            });
        }

        windowObject.addEventListener('beforeunload', disposeRasterCache);
    }

    return { setup, setStep, updateStepperUI };
}
