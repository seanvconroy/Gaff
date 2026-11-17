import { formatRent } from '@/lib/format';

/**
 * The words of adding a letting (section 4 of the UX redesign, UX-LT-1 to UX-LT-24). Plain,
 * short, and each screen says one thing. Nothing here, and nothing in the product, is called
 * "who it suits": the block is "Letting details" (section 6; rule 3).
 */
export const addLettingCopy = {
  flow: 'Add a letting',
  next: 'Next',
  back: 'Back',
  save: 'Save',
  saving: 'Saving…',
  saveAndExit: 'Save and exit',
  change: 'Change',

  start: {
    title: 'Tell Gaff about the home',
    box: 'Paste your advert, or describe the home in your own words.',
    /** UX-LT-1: for a brochure or screenshots, once files are read. Not shown until then. */
    attach: 'Attach a brochure, screenshots or photos',
    continue: 'Continue',
    manual: 'Fill it in myself',
    empty: 'Paste your advert or describe the home. Or fill it in yourself.',
    /** UX-LT-8 (Q31): a Daft or MyHome link is kept, and never fetched. */
    linkKept:
      'Got it. Gaff will use this link to match enquiries. Paste the advert’s text too, and Gaff will fill in the details.',
    /** Q31: any other link. Nothing is fetched from anywhere. */
    linkNotOpened:
      'Gaff doesn’t open links, so it can’t read that page. Paste the advert’s text here, or fill it in yourself.',
    /** UX-AI-13: the review's layout, while the advert is read. */
    reading: 'Reading your advert…',
    readingButton: 'Reading…',
    /** The text says nothing Gaff could find about a home. What was typed is kept. */
    couldNotMakeOut:
      'Gaff couldn’t make that out. Paste the advert’s text, or fill it in yourself.',
    /** UX-AI-12: the reader is slow or down. The manual route is on the same screen. */
    notJustNow: 'Gaff couldn’t read that just now. Try again, or fill it in yourself.',
    /** The reader is switched off (ADVERT_READER): the screen offers only what works. */
    readerOff:
      'Gaff isn’t reading adverts just now. Fill the home in yourself: it takes a few minutes.',
    drafts: 'Carry on with a home you started',
    draftWithoutAddress: 'A home with no address yet',
  },

  address: {
    title: 'Where is it?',
    search: 'Eircode or address',
    manual: 'Enter it myself',
    notFound: 'We can’t find that. Check the Eircode, or enter the address yourself.',
    choose: 'Choose an address from the list, or enter it yourself',
    line1: 'Address',
    line2: 'Address line 2',
    area: 'Town or area',
    areaHint: 'Like Ranelagh, Dublin 6',
    county: 'County',
    eircode: 'Eircode',
  },

  rent: {
    title: 'Rent and date',
    rent: 'Rent a month',
    availableFrom: 'Available from',
  },

  home: {
    title: 'The home',
    type: 'Type of home',
    bedrooms: 'Bedrooms',
    studio: 'Studio',
    bathrooms: 'Bathrooms',
    furnishing: 'Furnishing',
    ber: 'BER rating',
    berChoose: 'Choose…',
    berExempt: 'Exempt',
    parking: 'Parking',
    description: 'About this home',
    descriptionHint: 'In your own words. Describe the home, not who should live in it.',
    facts: 'Anything else renters often ask?',
    factsHint: 'One fact on each line, like “Gas central heating”.',
  },

  photos: {
    title: 'Photos',
    skip: 'Skip for now',
  },

  details: {
    title: 'Letting details',
    lead: 'Switch on what matters for this let. Renters see it before they ask to view.',
    moveIn: 'Move-in date',
    moveInHint: 'For people who can move in by a date you choose',
    moveInBy: 'Move in by',
    stay: 'Length of stay',
    stayHint: 'For people who plan to stay at least this long',
    stayField: 'Plans to stay at least',
    people: 'Most people',
    peopleHint: 'The most people who can live there',
    peopleField: 'Most people who can live there',
    pets: 'No pets',
    petsHint: 'Assistance dogs are always welcome. They never count as pets.',
    houseRule: 'House rule',
    noSmoking: 'No smoking indoors',
    noSmokingHint: 'A term of the tenancy. Renters see it, and it isn’t used to rank anyone.',
    preview: 'What renters will see',
    nothing: 'Nothing asked. Everyone who enquires is ranked by when they enquired.',
    nothingToAdd: 'Nothing to add',
    why: 'Why only these?',
    whyText:
      'Equality law says a home can’t be advertised or let by who a person is. So Gaff asks only about the let itself: when, how long, how many people, and pets. Everyone is asked the same questions, and a person chooses who views.',
  },

  rentCheck: {
    lastLet: {
      title: 'Has this home been let before?',
      never: 'No, this is its first letting',
      before: 'Yes, and the last tenancy began before 1 March 2026',
      under: 'Yes, and the last tenancy began on or after 1 March 2026',
    },
    ending: { title: 'How did the last tenancy end?' },
    substantialChange: {
      title: 'Has the home been substantially changed since then?',
      hint: 'Rebuilt or extended, for example. Not redecorated.',
      yes: 'Yes',
      no: 'No',
    },
    previousRent: {
      title: 'What was the last rent?',
      rent: 'Last rent a month',
      setOn: 'Date that rent was set',
      setOnHint: 'Usually the day the last tenancy began, or the day of its last rent review.',
    },
    fromLastTime:
      'Filled in from the last time this home was let on Gaff. Change anything that’s different.',
  },

  rentResult: {
    market: {
      title: 'You can set the rent at market level',
      first_letting: 'This is the home’s first letting, so there’s no earlier rent to cap it.',
      tenant_ended:
        'The last tenancy began under the new rules and the tenant ended it, so the rent can be set afresh.',
    },
    capped: {
      title: 'The rent cap applies',
      tenancy_before_new_rules:
        'The last tenancy began before 1 March 2026, so the rent can rise only by inflation, up to 2% a year.',
      landlord_ended:
        'The landlord ended the last tenancy, so the rent can rise only by inflation, up to 2% a year.',
    },
    get_advice: {
      title: 'Get advice before you set the rent',
      substantial_change:
        'A home that has been substantially changed may be treated differently. Ask your solicitor or the RTB before you advertise it.',
    },
    overCap: (asking: number, most: number) =>
      `You’re asking ${formatRent(asking)}. The most the rules allow is ${formatRent(most)}.`,
    newRent: 'Rent a month',
    newRentHint: (most: number) => `${formatRent(most)} or less`,
    changeRent: 'Change the rent',
    tooHigh: (most: number) =>
      `Enter ${formatRent(most).replace(' a month', '')} or less. That’s the most the rules allow.`,
    about: 'About these rules',
    aboutText:
      'From 1 March 2026 rent can be set at market level for a first letting, or where the last tenancy began on or after that date and the tenant ended it. Otherwise it can rise only by inflation, up to 2% a year. The exact figure comes from the RTB’s rent calculator. Gaff’s check is a guide, not legal advice.',
    version: (version: string) => `Rules version ${version}.`,
    comparables:
      'Before you make an offer, Gaff will ask for three comparable rents from the RTB’s register.',
  },

  goLive: {
    title: 'Ready to go live',
    lead: 'This is what renters will see. Gaff answers every enquiry within minutes, as your AI assistant.',
    onGaff: 'On gaff.ie',
    onGaffHint:
      'Renters can find this home on Gaff and ask to view. Switch it off to take enquiries from Daft and MyHome only.',
    ber: 'BER rating',
    berHint: 'A home needs its BER to be shown on gaff.ie.',
    needsPhoto: 'A home needs one photo to be shown on gaff.ie.',
    addPhoto: 'Add a photo',
    shownLater: (needs: { ber: boolean; photo: boolean }) =>
      `It will show on gaff.ie once it has ${[needs.ber ? 'a BER' : null, needs.photo ? 'a photo' : null].filter(Boolean).join(' and ')}. It can go live now.`,
    phone: 'A number renters can call',
    phoneHint: 'For anyone who’d rather ring. Renters see it on their pages.',
    /**
     * UX-TS-2 (Q47): the private landlord's identity check, one step of their first go-live, and
     * never asked again. Before it starts, one line says what's kept (UX-RN-16's rule).
     */
    identity: {
      title: 'Confirm it’s you',
      lead: 'One check before your home goes live: confirm it’s you. About two minutes, once.',
      what: 'You’ll photograph your passport or driving licence and take a selfie.',
      keeps:
        'Gaff keeps only that it passed, your name and the date, on your own profile. Never the photos.',
      more: 'A secure ID service checks that the photo and the selfie match. Renters see “Identity verified” beside your first name. If you rent a home through Gaff later, you can use the same check.',
      moreLabel: 'More',
      button: 'Confirm it’s you',
      opening: 'Opening…',
      unfinished: 'It looks like this one wasn’t finished. You can start it again.',
      notPassed: 'That didn’t work this time',
      reasons: {
        document: 'The check couldn’t confirm your ID document.',
        face_mismatch: 'The check couldn’t match your selfie to your ID.',
        gave_up: 'The check wasn’t finished.',
      } as Record<string, string>,
      tryAgain: 'You can try again now.',
      next: 'Then you’ll come back here to put your home live.',
      problems: {
        no_provider: 'The ID check can’t be started here yet. Talk to us and we’ll sort it out.',
        not_allowed: 'This check is only for someone letting their own home.',
        done: 'You’ve already confirmed it’s you.',
      } as Record<string, string>,
    },
    start: 'Start taking enquiries',
    starting: 'Starting…',
    rentCheckFirst: 'Finish the rent check first. Then this home can go live.',
    toRentCheck: 'Go to the rent check',
    backToLetting: 'Back to the letting',
    letBy: (name: string) => `Let by ${name}`,
    noDetails: 'No letting details. Renters are asked nothing before a viewing.',
    noPhotos: 'No photos yet',
    morePhotos: (count: number) => (count === 1 ? '1 photo' : `${count} photos`),
  },

  advertised: {
    title: 'Is it advertised anywhere else?',
    /** UX-FL-4: what was done, what Gaff does next, and when. */
    live: (address: string) => `${address} is live`,
    lead: 'Gaff answers every enquiry for this home from now on, within minutes of each one. If it’s on Daft or MyHome too, Gaff can answer those as well.',
    daft: 'Daft',
    myhome: 'MyHome',
    no: 'No',
    choose: 'Choose where it’s advertised, or No',
    notBoth: 'Choose Daft, MyHome or both. Or choose No on its own.',
    done: 'Done',
  },

  review: {
    title: {
      again: 'Here’s the home from last time',
      advert: 'Here’s what Gaff found',
      enquiry: 'Here’s what Gaff found',
      manual: 'Here’s the home so far',
    },
    lead: {
      again: 'Change what’s new. Tap anything to change it.',
      other: 'Tap anything to change it.',
    },
    toCheck: (count: number) => (count === 1 ? '1 thing to check' : `${count} things to check`),
    nothingToCheck: 'Nothing to check',
    checkThis: 'Check this',
    looksRight: 'Looks right',
    photos: 'Photos',
    address: 'Address',
    rent: 'Rent and date',
    facts: 'The home',
    description: 'About this home',
    details: 'Letting details',
    missing: {
      address: 'No address yet',
      rent: 'No rent yet',
      availableFrom: 'No date yet',
      home: 'Type and bedrooms not chosen',
      ber: 'No BER yet',
      description: 'No description',
      photos: 'No photos yet',
      details: 'Nothing asked',
    },
    hasDescription: 'Described in your own words',
    moreFacts: (count: number) => (count === 1 ? '1 more fact' : `${count} more facts`),
    availableFrom: (date: string) => `Available from ${date}`,
    datePassed: (date: string) => `Was available from ${date}`,
    done: 'Done',

    /**
     * A home that was read (work package WP-10). UX-AI-1, UX-AI-4: what the AI filled in is
     * marked, and shows the words it came from. An enquiry is read by a parser, not the AI,
     * so it says where a value came from and carries no AI mark (section 7).
     */
    read: {
      advert: {
        pill: 'Read by AI',
        note: 'Gaff filled these in from your advert, and guessed nothing. Tap a row to see the words each one came from.',
        row: 'From your advert',
        from: 'From your advert',
      },
      enquiry: {
        pill: null,
        note: 'Gaff took the address from the enquiry, and guessed nothing. Tap a row to see where it came from.',
        row: 'From the enquiry',
        from: 'From the enquiry',
      },
      /** UX-LT-3: "From your advert: 'gas fired central heating'". */
      quote: (words: string) => `“${words}”`,
      unsure: 'The advert isn’t clear about this. Check it.',
      ownWords: {
        description: 'The description is in your advert’s own words. Gaff rewrote nothing.',
        otherFacts: 'These facts are in your advert’s own words.',
      },
      labels: {
        addressLine1: 'Address',
        addressLine2: 'Address line 2',
        area: 'Town or area',
        county: 'County',
        eircode: 'Eircode',
        rentCents: 'Rent a month',
        availableFrom: 'Available from',
        propertyType: 'Type of home',
        bedrooms: 'Bedrooms',
        bathrooms: 'Bathrooms',
        furnished: 'Furnishing',
        berRating: 'BER rating',
        parking: 'Parking',
        daftUrl: 'Daft advert',
        myhomeUrl: 'MyHome advert',
      },
      linkKept: 'Kept to match enquiries. Gaff doesn’t open it.',
    },
    /** UX-LT-6: said once, on the review. */
    leftOut: (count: number) =>
      `Gaff left out ${count === 1 ? '1 line' : `${count} lines`}. Adverts can’t say who a home suits.`,
    why: 'Why?',
    /** Three sentences (UX-LT-6). */
    whyText:
      'Equality law says a home can’t be advertised or let by who a person is. A line about who should apply, like “would suit a professional couple” or “no HAP”, can be read as turning people away, so Gaff leaves it out of what renters see. Describe the home instead: its rooms, its rent and what’s nearby.',
    leftOutLines: 'What Gaff left out',
    /** Section 6: the advert says something that could be a letting detail. A person decides. */
    suggested: {
      meta: 'Your advert mentions letting details. Nothing is asked until you save them.',
      note: 'Gaff has switched on what your advert says. Nothing is asked of renters until you save. Switch off anything you don’t want.',
      noPets: 'No pets',
      minStayMonths: 'Length of stay',
      maxOccupants: 'Most people',
    },
  },

  setup: {
    /** UX-LP: the letting's page, while it's being set up. */
    finish: 'Finish setting up',
    stepsLeft: (count: number) => (count === 1 ? '1 step left.' : `${count} steps left.`),
    continue: 'Continue',
    next: 'When it’s live, Gaff answers every enquiry within minutes.',
  },

  testEnquiry: {
    menu: 'Send a test enquiry',
    title: 'Send a test enquiry',
    lead: (address: string) =>
      `Gaff will answer a made-up enquiry about ${address}, so you can see what a renter gets. Nothing is sent to anyone.`,
    send: 'Send a test enquiry',
    sending: 'Sending…',
    resultTitle: 'Here’s what a renter gets',
    resultLead: (name: string) =>
      `Gaff’s first reply to ${name}, a made-up renter. A real one arrives within minutes of their enquiry.`,
    subject: 'Subject',
    asksQuestions:
      'The link takes a renter to the questions your letting details need. It takes them about a minute.',
    noQuestions: 'You asked for no letting details, so a renter is asked nothing before a viewing.',
    done: 'Done',
  },

  /** UX-LT-16: in Inbox, on an enquiry Gaff couldn't match to any home. */
  fromEnquiry: {
    question: 'Is it about a home that isn’t on Gaff yet?',
    lead: 'Gaff can start it from this email, with the address and the advert’s link. The enquiry joins the home once it’s set up, and Gaff answers it when the home goes live.',
    start: 'Start a letting from this enquiry',
    starting: 'Starting…',
    carryOn: 'Carry on with this home',
  },

  letAgain: {
    menu: 'Let it again',
    starting: 'Getting it ready…',
  },
} as const;
