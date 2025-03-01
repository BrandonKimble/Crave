import React from 'react';
import { View, Text, TextInput, TouchableOpacity} from 'react-native';
import { useSearchStore } from '../../store/searchStore';

const HomeScreen = () => {
  const { query, setQuery } = useSearchStore();

  const handleSearch = () => {
    console.log('Searching for:', query);
    // API call will go here
  };

  return (
    <View className="flex-1 p-4">
      <Text className="text-2xl font-bold mb-4">Crave Search</Text>
      <TextInput
        className="w-full h-12 px-4 border border-gray-300 rounded-lg mb-4"
        value={query}
        onChangeText={setQuery}
        placeholder="What are you craving?"
      />
      <TouchableOpacity 
        className="w-full h-12 bg-primary rounded-lg items-center justify-center"
        onPress={handleSearch}
      >
        <Text className="text-white font-bold">Search</Text>
      </TouchableOpacity>
    </View>
  );
};

export default HomeScreen;

// Create similar placeholder files for other screens
