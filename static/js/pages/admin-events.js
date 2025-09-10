// Admin Events Page JavaScript
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.delete-button').forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            const form = this.closest('form');

            Swal.fire({
                title: 'Are you sure?',
                text: "You won't be able to revert this!",
                icon: 'warning',
                background: 'var(--card-color)',
                color: 'var(--text-primary)',
                showCancelButton: true,
                confirmButtonColor: 'var(--primary-color)',
                cancelButtonColor: 'var(--danger-color)',
                confirmButtonText: 'Yes, delete it!'
            }).then((result) => {
                if (result.isConfirmed) {
                    form.submit();
                }
            });
        });
    });
});
