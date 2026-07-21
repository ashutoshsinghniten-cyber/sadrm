// Geographic hierarchy for Digital Repository filtering
// Country → State → County → Area (City/Town or unincorporated area)
export const GEO_HIERARCHY = {
  'USA': {
    'Florida': {
      'Hillsborough County': ['Tampa', 'Brandon', 'Plant City', 'Temple Terrace'],
      'Pinellas County': ['St. Petersburg', 'Clearwater', 'Largo'],
      'Orange County': ['Orlando', 'Winter Park', 'Apopka'],
      'Miami-Dade County': ['Miami', 'Coral Gables', 'Homestead']
    },
    'Massachusetts': {
      'Suffolk County': ['Boston', 'Chelsea', 'Revere', 'Winthrop'],
      'Middlesex County': ['Cambridge', 'Lowell', 'Newton', 'Somerville'],
      'Norfolk County': ['Quincy', 'Brookline', 'Weymouth']
    },
    'South Carolina': {
      'Beaufort County': ['Hilton Head', 'Beaufort', 'Bluffton'],
      'Charleston County': ['Charleston', 'Mount Pleasant', 'North Charleston'],
      'Greenville County': ['Greenville', 'Greer', 'Simpsonville']
    },
    'Georgia': {
      'Fulton County': ['Atlanta', 'Sandy Springs', 'Milton', 'Roswell', 'Alpharetta'],
      'Cobb County': ['Smyrna', 'Marietta', 'Kennesaw', 'Powder Springs'],
      'DeKalb County': ['Stone Mountain', 'Decatur', 'Dunwoody', 'Tucker'],
      'Gwinnett County': ['Snellville', 'Lawrenceville', 'Duluth', 'Norcross'],
      'Clayton County': ['Jonesboro', 'Forest Park', 'Morrow']
    },
    'New York': {
      'New York County': ['Manhattan'],
      'Kings County': ['Brooklyn'],
      'Queens County': ['Queens', 'Flushing', 'Astoria']
    },
    'California': {
      'Los Angeles County': ['Los Angeles', 'Long Beach', 'Pasadena', 'Santa Monica'],
      'San Francisco County': ['San Francisco'],
      'Orange County': ['Anaheim', 'Irvine', 'Santa Ana']
    },
    'Texas': {
      'Harris County': ['Houston', 'Pasadena', 'Baytown'],
      'Dallas County': ['Dallas', 'Irving', 'Garland'],
      'Travis County': ['Austin']
    }
  },
  'Canada': {
    'Ontario': {
      'Toronto Division': ['Toronto', 'Scarborough', 'North York', 'Etobicoke'],
      'Peel Region': ['Mississauga', 'Brampton', 'Caledon']
    },
    'British Columbia': {
      'Metro Vancouver': ['Vancouver', 'Burnaby', 'Richmond', 'Surrey']
    }
  }
};

export const QC_OUTREACH_STAFF = ['reviewer1@tsa.org', 'reviewer2@tsa.org', 'donor-relations@tsa.org', 'admin@tsa.org'];
