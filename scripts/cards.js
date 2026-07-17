/**
 * CARD SPOTLIGHT EFFECT
 * This function attaches the mouse-tracking logic to any card.
 */
function initializeCardEffect(card) {
    card.onmousemove = e => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        card.style.setProperty("--mouse-x", `${x}px`);
        card.style.setProperty("--mouse-y", `${y}px`);
    };

    card.onmouseleave = () => {
        card.style.setProperty("--mouse-x", `-1000px`);
        card.style.setProperty("--mouse-y", `-1000px`);
    };
}

/**
 * RENDER CARDS FROM JSON
 * This looks for an element with id="json-content" and fills it.
 */
function renderCards(data, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    data.forEach(item => {
        const bgImage = item.image && item.image !== "" ? item.image : 'backgrounds/default.jpg'; 
        const card = document.createElement('a');
        card.className = 'card';
        card.href = item.link || '#'; 

        card.innerHTML = `
            <div class="aspect-ratio-spacer"></div>
            <div class="card-background" style="background-image: url('${bgImage}');"></div>
            <span class="card-content">
                <p class="card-category">${item.category}</p>
                <h3 class="card-heading">${item.name}</h3>
                <p class="card-description">${item.description}</p>
            </span>
        `;

        // Apply the effect to the newly created card
        initializeCardEffect(card);
        container.appendChild(card);
    });
}