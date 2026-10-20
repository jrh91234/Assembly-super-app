window.openWidgetManager = function() {
    const container = document.getElementById('widget-manager-list');
    container.innerHTML = '';
    WIDGET_LIST.forEach(w => {
        const isChecked = !hiddenWidgets.includes(w.id); 
        container.innerHTML += `
            <label class="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg border hover:bg-blue-50 cursor-pointer transition-colors">
                <input type="checkbox" value="${w.id}" class="widget-toggle-chk w-5 h-5 text-blue-600 rounded" ${isChecked ? 'checked' : ''}>
                <span class="text-sm font-medium text-gray-700">${w.label}</span>
            </label>
        `;
    });
    document.getElementById('modal-widget-manager').classList.remove('hidden');
};

window.saveWidgetSettings = async function() {
    const checkboxes = document.querySelectorAll('.widget-toggle-chk');
    const newHidden = [];
    checkboxes.forEach(chk => {
        if (!chk.checked) newHidden.push(chk.value);
    });

    const btn = document.getElementById('btn-save-widgets');
    const originalText = btn.innerHTML;
    btn.innerHTML = "⏳ กำลังอัปเดต...";
    btn.disabled = true;

    try {
        await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({ action: 'SAVE_HIDDEN_WIDGETS', data: newHidden })
        });
        hiddenWidgets = newHidden;
        window.applyWidgetVisibility();
        document.getElementById('modal-widget-manager').classList.add('hidden');
        setTimeout(() => { 
            Object.values(charts).forEach(c => { if(c && typeof c.resize === 'function') c.resize(); }); 
        }, 200);
    } catch(e) {
        alert("Error saving settings");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

window.applyWidgetVisibility = function() {
    WIDGET_LIST.forEach(w => {
        const el = document.getElementById(w.id);
        if (el) {
            if (hiddenWidgets.includes(w.id)) el.classList.add('hidden');
            else el.classList.remove('hidden');
        }
    });
};

