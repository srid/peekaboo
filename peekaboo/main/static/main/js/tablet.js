$.fn.serializeObject = function() {
  var o = {};
  var a = this.serializeArray();
  $.each(a, function() {
    if (o[this.name] !== undefined) {
      if (!o[this.name].push) {
        o[this.name] = [o[this.name]];
      }
      o[this.name].push(this.value || '');
    } else {
      o[this.name] = this.value || '';
    }
  });
  return o;
};

var Utils = (function() {
  return {
    general_error: function(msg, reload_tip) {
      console.log('XXX -- this needs a lot more work');
      alert(msg);
    },
    ajax_error: function(msg, description, callback) {
      $('#error h3').text(msg);
      if (description) {
        $('#error .description').text(description);
      } else {
        $('#error .description').text($('#error .description').data('default'));
      }
      $('#error').modal();
      if (callback) {
        callback();
      }
    }
  };
})();

var Config = (function() {
  // XXX could set up a cache here
  return {
    get: function(key) {
      return $('body').data('config-' + key);
    },
    set: function(key, value) {
      $('body').data('config-' + key, value);
    }
  }
})();


var SignIn = (function() {
  var current_file;
  var _auto_reset_timer = null;

  function opened(id) {
    /* Called when a pain is opened */

    if (id === '#thankyou') {
      _auto_reset_timer = setTimeout(function() {
        console.log("Automatically resetting");
        reset_all();
      }, 20 * 1000);
    }

  }

  function submit(form) {
    var $form = $(form);
    $('#id_location', $form).val(Location.get_current_location().id);
    $.post($form.attr('action'), $form.serializeObject(), function(response) {
        if (response.errors) {
          $.each(response.errors, function(key, errors) {
            if (key === '__all__') {
              Utils.general_error(errors.join('<br>'));
            } else {
              var $input = $('[name="' + key + '"]', form);
              $input
                .parents('.control-group')
                  .addClass('error');
              $input.on('change', function() {
                $(this).parents('.error').removeClass('error');
                $('.help-inline', $(this).parents('.controls')).remove();
              });
              var $controls = $input.parents('.controls');
              $('.help-inline', $controls).remove();
              $('<span class="help-inline">')
                .text(errors.join(' '))
                  .appendTo($controls);
            }
          });

        } else {
          form.reset();
          $('#signin').hide();
          $('.yourname').text(response.name);
          if (Config.get('take-picture')) {
            $('#picture').data('id', response.id);
            $('#picture').fadeIn(300, function() {
              opened('#picture');
            });
          } else {
            $('#thankyou').fadeIn(300, function() {
              opened('#thankyou');
            });
          }

        }
    });
  }

  function upload_current_file(file, callback) {
    var fd = new FormData();
    fd.append('picture', file);
    $.ajax({
       url: 'upload/' + $('#picture').data('id') + '/',
      type: 'POST',
      data: fd,
      cache: false,
      contentType: false,
      processData: false,
      success: callback
    });
  }

  function picture_changed(event) {
         var preview_img = $('#picture .preview img');
         var files = event.target.files;

         if (files && files.length > 0) {
           current_file = files[0];

           try {
             // Get window.URL object
             var URL = window.URL || window.webkitURL;


             // Create ObjectURL
             var imgURL = URL.createObjectURL(current_file);

             // Set img src to ObjectURL
             preview_img.attr('src', imgURL);

             // Revoke ObjectURL
             URL.revokeObjectURL(imgURL);
             $('#picture .preview').show();
           } catch (e) {
             try {
               // Fallback if createObjectURL is not supported
               var fileReader = new FileReader();
               fileReader.onload = function (event) {
                 //showPicture.src = event.target.result;
                 preview_img.attr('src', event.target.result);

               };
               fileReader.readAsDataURL(current_file);
               $('#picture .preview').show();
             } catch (e) {
               // Display error message
               $('#picture .error span')
                 .text("Neither createObjectURL or FileReader are supported");
               $('#picture .error').show();
             }
           }
         }
  }

  function reset_all() {
    $('#loading').hide();
    $('#thankyou').hide();
    $('#picture').hide();
    $('#signin form')[0].reset();
    $('.yourname').text('');
    $('#signin').fadeIn(0, function() {
      SignIn.opened('#signin');
    });
    if (_auto_reset_timer) {
      clearTimeout(_auto_reset_timer);
    }
  }

  return {
    init: function() {

      $('a.reset').click(function() {
        reset_all();
        return false;
      });

      $('#signin form').submit(function() {
        submit(this);
        return false;
      });

      $('#picture input[type="file"]').change(picture_changed);
      $('#picture .proceed').click(function() {
        $('#picture .uploading').show();
        upload_current_file(current_file, function(response) {
          console.log(response);
          $('#picture .uploading').hide();
          $('#picture').hide();
          if (response.thumbnail) {
            $('#thankyou .thumbnail')
              .attr('src', response.thumbnail.url)
              .attr('width', response.thumbnail.width)
              .attr('height', response.thumbnail.height);
              $('#thankyou .thumbnail').show();
          } else {
             $('#thankyou .thumbnail').hide();
          }
          $('#thankyou').fadeIn(300, function() {
            opened('#thankyou');
          });
         });
        return false;
     });
      $('#picture .skip').click(function() {
          $('#picture').hide();
          $('#thankyou').fadeIn(300, function() {
            opened('#thankyou');
          });
        return false;
      });
    },
    opened: function(id) {
      opened(id);
    }
  };
})();



var Location = (function() {
  var current_location_name, current_location_id;

  function clicked_location(event) {
    var $self = $(this);
    current_location_name = $self.data('name');
    current_location_id = $self.data('id');
    localStorage.setItem('location-name', current_location_name);
    localStorage.setItem('location-id', current_location_id);
    location_chosen();
    return false;
  }

  function location_chosen() {
    Config.set('current-location', current_location_id);
    $('#location').hide();
    $('#footer .current-location a').text(current_location_name);
    $('#footer').show();
    $('#signin').fadeIn(300, function() {
      SignIn.opened('#signin');
    });
  }

  function location_not_chosen() {
    $('.pane:visible').hide();
    $('#location').fadeIn(0, function() {
      SignIn.opened('#location');
    });
    $('#footer').hide();

    var $choices = $('#location .available-locations');
    $('p', $choices).remove();
    $.getJSON('/tablet/locations/', function(response) {
      $.each(response.locations, function(i, each) {
        $('<a href="#">')
          .addClass('btn').addClass('btn-large')
          .text(each.name)
          .data('name', each.name)
          .data('id', each.id)
          .click(clicked_location)
          .appendTo($('<p>').appendTo($choices));
      });
    });
  }

  return {
     get_current_location: function() {
       return {id: current_location_id, name: current_location_name};
     },
     init: function() {
       $('#footer .current-location a').click(function() {
         location_not_chosen();
         return false;
       });

       current_location_name = localStorage.getItem('location-name');
       current_location_id = localStorage.getItem('location-id');
       if (!(current_location_name && current_location_id)) {
         location_not_chosen();
       } else {
         location_chosen();
       }

     }
  };
})();


$(function() {
  Location.init();
  SignIn.init();

  $(document).ajaxStart(function() {
    $('#loading').show();
  });

  $(document).ajaxStop(function() {
    $('#loading').hide();
  });

  $(document).ajaxError(function(event, jqxhr, settings, exception) {
    $('#loading').hide();
    Utils.ajax_error("Internal server error", jqxhr.responseText, function() {
      // reset_all() ??
    });
  });
});
