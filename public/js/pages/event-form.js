// Event Form Page JavaScript
$(document).ready(function () {
    // Add timeline functionality
    $('#addTimeline').click(function () {
        const timelineEntry = `
            <tr class="timeline-entry">
                <td>
                    <input type="text" class="form-control" name="timelineName[]" placeholder="Enter timeline name">
                </td>
                <td>
                    <select class="form-control timezone-select" name="timezone[]">
                        <option value="WIB">WIB</option>
                        <option value="WITA">WITA</option>
                        <option value="WIT">WIT</option>
                    </select>
                </td>
                <td>
                    <input type="datetime-local" class="form-control datetime-input" name="timelineStart[]" data-timezone="WIB">
                </td>
                <td>
                    <input type="datetime-local" class="form-control datetime-input" name="timelineEnd[]" data-timezone="WIB">
                </td>
                <td>
                    <input type="text" class="form-control" name="location[]" value="Online">
                </td>
                <td>
                    <button type="button" class="btn btn-danger remove-timeline">Remove</button>
                </td>
            </tr>`;
        $('#timelineContainer').append(timelineEntry);
    });

    // Remove timeline functionality
    $(document).on('click', '.remove-timeline', function () {
        $(this).closest('.timeline-entry').remove();
    });

    // Character count for description
    $('#description').on('input', function () {
        const charCount = $(this).val().length;
        $('#charCount').text(charCount);
        if (charCount > 800) {
            $('#descriptionHelp').addClass('text-danger');
        } else {
            $('#descriptionHelp').removeClass('text-danger');
        }
    });

    // Form validation
    $('#eventForm').submit(function (event) {
        const description = $('#description').val();
        if (description.length > 800) {
            event.preventDefault();
            alert('Description must be 800 characters or fewer.');
        }
    });

    // Initialize character count
    const initialCharCount = $('#description').val().length;
    $('#charCount').text(initialCharCount);
});
