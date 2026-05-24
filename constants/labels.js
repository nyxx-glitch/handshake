export const SIGN_LABELS = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
    'N', 'Ñ', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    '1', '2', '3', '4', '5', '6', '7', '8', '9',
    'Birth','Day','Name','What','Why','Where','Which','Who','When','How','Family','Friend','I Love You',
    'Me','Month','Age','You','Meet','Good','Nice','Place','Year'
    ,'Morning','Afternoon','Evening','Idle'
  ];

export const WORD_LABELS = [
  'Birth', 'Day', 'Name', 'What', 'Why', 'Where', 'Which', 'Who', 'When', 'How', 
  'Family', 'Friend', 'I Love You', 'Me', 'Month', 'Age', 'You', 'Meet', 'Good', 
  'Nice', 'Place', 'Year', 'Morning', 'Afternoon', 'Evening'
];

export const CONTEXT_RULES = {
  NUMBER_TRIGGERS: ['Age', 'Year', 'Month', 'Birth', ],
  ALPHABET_TRIGGERS: ['Name', 'Place', 'Friend', 'Family','What', 'Why', 'Where', 'Which', 'Who', 'When', 'How' ],
  AMBIGUOUS_MAP: {
    'V': '2',
    'W': '6',
    'O': '0'
  }
};


export const LABEL_VARIANTS = {
  '0': 'O', 
};