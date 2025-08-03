// TruckOpti Main JS

// SPA-like navigation (basic, for Flask templates)
document.addEventListener('DOMContentLoaded', function() {
    // Wizard step logic for packing job creation
    if (document.querySelector('.wizard-step')) {
        let steps = document.querySelectorAll('.wizard-step');
        let current = 0;
        function showStep(idx) {
            steps.forEach((el, i) => el.style.display = i === idx ? 'block' : 'none');
        }
        showStep(current);
        document.querySelectorAll('.wizard-next').forEach(btn => {
            btn.addEventListener('click', () => {
                if (current < steps.length - 1) showStep(++current);
            });
        });
        document.querySelectorAll('.wizard-prev').forEach(btn => {
            btn.addEventListener('click', () => {
                if (current > 0) showStep(--current);
            });
        });
    }

    // Delete confirmation for all delete buttons
    document.querySelectorAll('.btn-danger').forEach(btn => {
        btn.addEventListener('click', function(e) {
            if (!confirm('Are you sure you want to delete this item?')) {
                e.preventDefault();
            }
        });
    });

    // 3D Visualization placeholder
    if (document.getElementById('packedTruck3D')) {
        document.getElementById('packedTruck3D').innerHTML =
            '<div style="padding:2em;text-align:center;color:#888;">[3D Visualization Placeholder]</div>';
    }
});