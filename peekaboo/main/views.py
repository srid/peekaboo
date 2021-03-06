import datetime
import time
from cStringIO import StringIO
from collections import defaultdict
from django import http
from django.shortcuts import render, get_object_or_404
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.core.files import File
from sorl.thumbnail import get_thumbnail
from . import forms
from .models import Visitor, Location
from .utils import json_view


def home(request):
    data = {}
    return render(request, 'main/home.html', data)


def tablet(request):
    data = {}
    data['form'] = forms.SignInForm()
    data['take_picture'] = settings.TABLET_TAKE_PICTURE
    return render(request, 'main/tablet.html', data)


@require_POST
@json_view
def tablet_signin(request):
    form = forms.SignInForm(request.POST)
    if form.is_valid():
        visitor = form.save()
        data = {
            'id': visitor.pk,
            'name': visitor.get_name(),
        }
        return data
    else:
        errors = defaultdict(list)
        for name, error in form.errors.items():
            errors[name] = error
        return {'errors': errors}

@require_POST
@json_view
@csrf_exempt
def tablet_upload(request, pk):
    visitor = get_object_or_404(Visitor, pk=pk)
    form = forms.PictureForm(request.POST, request.FILES, instance=visitor)
    if form.is_valid():
        visitor = form.save()
        thumbnail_geometry = request.GET.get('thumbnail_geometry', '100')
        thumbnail = get_thumbnail(
            visitor.picture,
            thumbnail_geometry
        )
        data = {
            'ok': True,
            'thumbnail': {
                'url': thumbnail.url,
                'width': thumbnail.width,
                'height': thumbnail.height,
            }
        }
    else:
        data = {'errors': form.errors}
    return data


def log_start(request):
    data = {}
    return render(request, 'main/log-start.html', data)


def log(request, location):
    location = get_object_or_404(Location, slug=location)
    data = {
        'edit_form': forms.SignInForm(),
        'location': location,
    }
    request.session['default-location'] = location.slug
    return render(request, 'main/log.html', data)


@json_view
def log_entries(request, location):
    data = {
        'latest': None,
        'rows': []
    }
    location = get_object_or_404(Location, slug=location)
    thumbnail_geometry = request.GET.get('thumbnail_geometry', '100')

    def format_date(dt):
        dt_date = dt.strftime('%m/%d/%Y')
        dt_time = dt.strftime('%H:%M')
        dt_tz = dt.tzname() or 'UTC'
        return ' '.join([dt_date, dt_time, dt_tz])

    qs = Visitor.objects.filter(location=location)
    if request.GET.get('latest'):
        latest = datetime.datetime.fromtimestamp(
            float(request.GET['latest'])
        )
        # because latest is potentially lacking in microseconds
        # add some to prevent fetching it again
        latest += datetime.timedelta(seconds=1)
        qs = qs.filter(created__gte=latest)
    first = None
    for visitor in qs.order_by('created'):

        row = {
            'id': visitor.pk,
            'created': format_date(visitor.created),
            'created_iso': visitor.created.isoformat(),
            'title': visitor.title,
            'name': visitor.get_name(formal=True),
            'thumbnail': None,
            'visiting': visitor.visiting,
            'company': visitor.company,
            'email': visitor.email,
        }
        if visitor.picture:
            thumbnail = get_thumbnail(
                visitor.picture,
                thumbnail_geometry
            )
            row['thumbnail'] = {
                'url': thumbnail.url,
                'width': thumbnail.width,
                'height': thumbnail.height,
            }
        data['rows'].append(row)
        first = visitor.created
    if first:
        data['latest'] = time.mktime(first.timetuple())
    return data


@json_view
def log_entry(request, pk):
    visitor = get_object_or_404(Visitor, pk=pk)
    thumbnail_geometry = request.GET.get('thumbnail_geometry', '100')

    if request.method == 'POST':
        form = forms.SignInForm(request.POST, instance=visitor)
        if form.is_valid():
            form.save()
            data = form.cleaned_data
        else:
            return {'errors': form.errors}
    else:
        data = {
            'first_name': visitor.first_name,
            'last_name': visitor.last_name,
            'title': visitor.title,
            'email': visitor.email,
            'company': visitor.company,
            'visiting': visitor.visiting,
            'thumbnail_url': None,
        }
    if visitor.picture:
        thumbnail = get_thumbnail(
            visitor.picture,
            thumbnail_geometry
        )
        data['thumbnail'] = {
            'url': thumbnail.url,
            'width': thumbnail.width,
            'height': thumbnail.height,
        }
    return data


@json_view
@require_POST
def delete_entry(request, pk):
    visitor = get_object_or_404(Visitor, pk=pk)
    visitor.delete()
    # XXX delete all images too??
    return {'deleted': True}


@json_view
def tablet_locations(request):
    locations = []
    # temporary hack
    if not Location.objects.all().count():
        Location.objects.create(
            name='Mountain View',
            slug='mv',
            timezone='US/Pacific',
        )
    for each in Location.objects.all().order_by('name'):
        locations.append({
            'id': each.pk,
            'name': each.name,
        })
    return {'locations': locations}
