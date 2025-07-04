import React from 'react';
import { X, MapPin } from 'lucide-react';

interface InteractiveGlobeProps {
  selectedCountry: string;
  onSelectCountry: (country: string) => void;
  onClose: () => void;
}

// Continent-based country organization with famous countries (limited to fit screen)
const CONTINENT_DATA = [
  {
    name: 'NORTH AMERICA',
    icon: '🌎',
    countries: [
      { name: 'United States', flag: '🇺🇸' },
      { name: 'Canada', flag: '🇨🇦' },
      { name: 'Mexico', flag: '🇲🇽' },
      { name: 'Cuba', flag: '🇨🇺' },
      { name: 'Jamaica', flag: '🇯🇲' },
      { name: 'Guatemala', flag: '🇬🇹' },
      { name: 'Costa Rica', flag: '🇨🇷' },
    ]
  },
  {
    name: 'SOUTH AMERICA',
    icon: '🌎',
    countries: [
      { name: 'Brazil', flag: '🇧🇷' },
      { name: 'Argentina', flag: '🇦🇷' },
      { name: 'Chile', flag: '🇨🇱' },
      { name: 'Colombia', flag: '🇨🇴' },
      { name: 'Peru', flag: '🇵🇪' },
      { name: 'Ecuador', flag: '🇪🇨' },
      { name: 'Uruguay', flag: '🇺🇾' },
    ]
  },
  {
    name: 'EUROPE',
    icon: '🌍',
    countries: [
      { name: 'United Kingdom', flag: '🇬🇧' },
      { name: 'Germany', flag: '🇩🇪' },
      { name: 'France', flag: '🇫🇷' },
      { name: 'Italy', flag: '🇮🇹' },
      { name: 'Spain', flag: '🇪🇸' },
      { name: 'Netherlands', flag: '🇳🇱' },
      { name: 'Poland', flag: '🇵🇱' },
    ]
  },
  {
    name: 'ASIA',
    icon: '🌏',
    countries: [
      { name: 'China', flag: '🇨🇳' },
      { name: 'Japan', flag: '🇯🇵' },
      { name: 'India', flag: '🇮🇳' },
      { name: 'South Korea', flag: '🇰🇷' },
      { name: 'Thailand', flag: '🇹🇭' },
      { name: 'Singapore', flag: '🇸🇬' },
      { name: 'Malaysia', flag: '🇲🇾' },
    ]
  },
  {
    name: 'AFRICA',
    icon: '🌍',
    countries: [
      { name: 'South Africa', flag: '🇿🇦' },
      { name: 'Egypt', flag: '🇪🇬' },
      { name: 'Nigeria', flag: '🇳🇬' },
      { name: 'Kenya', flag: '🇰🇪' },
      { name: 'Morocco', flag: '🇲🇦' },
      { name: 'Ghana', flag: '🇬🇭' },
      { name: 'Ethiopia', flag: '🇪🇹' },
    ]
  },
  {
    name: 'OCEANIA',
    icon: '🌏',
    countries: [
      { name: 'Australia', flag: '🇦🇺' },
      { name: 'New Zealand', flag: '🇳🇿' },
      { name: 'Fiji', flag: '🇫🇯' },
      { name: 'Papua New Guinea', flag: '🇵🇬' },
      { name: 'Samoa', flag: '🇼🇸' },
      { name: 'Tonga', flag: '🇹🇴' },
      { name: 'Vanuatu', flag: '🇻🇺' },
    ]
  },
  {
    name: 'MIDDLE EAST',
    icon: '🌍',
    countries: [
      { name: 'Turkey', flag: '🇹🇷' },
      { name: 'Saudi Arabia', flag: '🇸🇦' },
      { name: 'UAE', flag: '🇦🇪' },
      { name: 'Israel', flag: '🇮🇱' },
      { name: 'Iran', flag: '🇮🇷' },
      { name: 'Qatar', flag: '🇶🇦' },
      { name: 'Kuwait', flag: '🇰🇼' },
    ]
  }
];

export default function InteractiveGlobe({ selectedCountry, onSelectCountry, onClose }: InteractiveGlobeProps) {
  const handleCountryClick = (countryName: string) => {
    onSelectCountry(countryName);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white border-4 border-black shadow-[12px_12px_0px_0px_#000] w-full max-w-7xl h-[95vh] sm:h-[90vh] flex flex-col">

        {/* Header - Mobile responsive */}
        <div className="border-b-4 border-black p-3 sm:p-4 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2 sm:gap-3">
            <MapPin className="w-6 h-6 sm:w-8 sm:h-8 text-black" />
            <h2 className="text-lg sm:text-2xl font-black text-black">SELECT YOUR COUNTRY</h2>
          </div>
          <button
            onClick={onClose}
            className="bg-red-500 text-white border-4 border-black shadow-[3px_3px_0px_0px_#000] hover:bg-red-400 hover:shadow-[4px_4px_0px_0px_#000] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all w-10 h-10 flex items-center justify-center font-black"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Continent Grid - Fixed height without scrollbars */}
        <div className="flex-1 p-3 sm:p-6 bg-white">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 sm:gap-4 h-full">
            {CONTINENT_DATA.map((continent, index) => (
              <div key={index} className="bg-gray-100 border-4 border-black shadow-[4px_4px_0px_0px_#000] flex flex-col">

                {/* Continent Header - Mobile responsive */}
                <div className="bg-black text-white p-2 sm:p-3 border-b-4 border-black">
                  <div className="text-center">
                    <div className="text-xl sm:text-2xl mb-1">{continent.icon}</div>
                    <h3 className="font-black text-xs sm:text-xs">{continent.name}</h3>
                  </div>
                </div>

                {/* Countries List - Fixed height, no scrollbar */}
                <div className="flex-1 p-1 sm:p-2 space-y-1">
                  {continent.countries.map((country, countryIndex) => (
                    <button
                      key={countryIndex}
                      onClick={() => handleCountryClick(country.name)}
                      className={`w-full p-1 sm:p-1.5 text-left font-bold text-xs transition-all border-2 border-black shadow-[2px_2px_0px_0px_#000] hover:shadow-[3px_3px_0px_0px_#000] hover:translate-x-[-1px] hover:translate-y-[-1px] ${
                        selectedCountry === country.name 
                          ? 'bg-black text-white' 
                          : 'bg-white text-black hover:bg-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <span className="text-xs">{country.flag}</span>
                        <span className="truncate text-xs">{country.name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer with Quick Actions - Mobile responsive */}
        <div className="border-t-4 border-black p-3 sm:p-4 bg-white">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-0 sm:justify-between">
            <div className="flex items-center gap-2">
              {selectedCountry && selectedCountry !== 'Any on Earth' && (
                <div className="bg-black text-white px-2 sm:px-3 py-1 border-2 border-black font-black text-xs sm:text-sm">
                  SELECTED: {selectedCountry}
                </div>
              )}
            </div>
            <button
              onClick={() => {
                onSelectCountry('Any on Earth');
                onClose();
              }}
              className="px-4 sm:px-6 py-2 bg-gray-200 text-black border-4 border-black font-black text-xs sm:text-sm hover:bg-gray-300 shadow-[3px_3px_0px_0px_#000] hover:shadow-[4px_4px_0px_0px_#000] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all"
            >
              ANY ON EARTH 🌍
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}