package com.crave;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableType;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

final class RestaurantPanelSnapshotPayload {
  static final class DecodeException extends Exception {
    DecodeException(@NonNull String message) {
      super(message);
    }
  }

  static final class HoursRow {
    final String label;
    final String value;

    HoursRow(@NonNull ReadableMap row, @NonNull String path) throws DecodeException {
      label = requiredStringValue(row, "label", path);
      value = requiredStringValue(row, "value", path);
    }
  }

  static final class Location {
    final String title;
    @Nullable final String status;
    final String address;
    @Nullable final String phone;
    @NonNull final List<HoursRow> hoursRows;
    @Nullable final String websiteHost;

    Location(@NonNull ReadableMap location, @NonNull String path) throws DecodeException {
      title = requiredStringValue(location, "title", path);
      status = optionalStringValue(location, "status", path);
      address = requiredStringValue(location, "address", path);
      phone = optionalStringValue(location, "phone", path);
      hoursRows = Collections.unmodifiableList(
        readHoursRows(requiredArrayValue(location, "hoursRows", path), path + ".hoursRows")
      );
      websiteHost = optionalStringValue(location, "websiteHost", path);
    }
  }

  static final class Dish {
    final String id;
    final String name;
    final String score;
    final String activity;
    final String pollCount;
    final String totalVotes;

    Dish(@NonNull ReadableMap dish, @NonNull String path) throws DecodeException {
      id = requiredStringValue(dish, "id", path);
      name = requiredStringValue(dish, "name", path);
      score = requiredStringValue(dish, "score", path);
      activity = requiredStringValue(dish, "activity", path);
      pollCount = requiredStringValue(dish, "pollCount", path);
      totalVotes = requiredStringValue(dish, "totalVotes", path);
    }
  }

  @Nullable final String restaurantId;
  final String restaurantName;
  final String primaryAddress;
  @Nullable final String shareMessage;
  final String restaurantScore;
  final String queryScoreLabel;
  final String queryScoreValue;
  final String priceLabel;
  final String hoursSummary;
  final String locationsLabel;
  @Nullable final String websiteUrl;
  @Nullable final String websiteSearchQuery;
  @Nullable final String phoneNumber;
  @Nullable final String phoneSearchQuery;
  final boolean isLoading;
  final boolean isFavorite;
  final boolean favoriteEnabled;
  final boolean showWebsiteAction;
  final boolean showCallAction;
  @NonNull final List<String> matchedTags;
  @NonNull final List<Location> locations;
  @NonNull final List<Dish> dishes;

  private RestaurantPanelSnapshotPayload(@NonNull ReadableMap snapshot) throws DecodeException {
    restaurantId = optionalStringValue(snapshot, "restaurantId", "snapshot");
    restaurantName = requiredStringValue(snapshot, "restaurantName", "snapshot");
    primaryAddress = requiredStringValue(snapshot, "primaryAddress", "snapshot");
    shareMessage = optionalStringValue(snapshot, "shareMessage", "snapshot");
    restaurantScore = requiredStringValue(snapshot, "restaurantScore", "snapshot");
    queryScoreLabel = requiredStringValue(snapshot, "queryScoreLabel", "snapshot");
    queryScoreValue = requiredStringValue(snapshot, "queryScoreValue", "snapshot");
    priceLabel = requiredStringValue(snapshot, "priceLabel", "snapshot");
    hoursSummary = requiredStringValue(snapshot, "hoursSummary", "snapshot");
    locationsLabel = requiredStringValue(snapshot, "locationsLabel", "snapshot");
    websiteUrl = optionalStringValue(snapshot, "websiteUrl", "snapshot");
    websiteSearchQuery = optionalStringValue(snapshot, "websiteSearchQuery", "snapshot");
    phoneNumber = optionalStringValue(snapshot, "phoneNumber", "snapshot");
    phoneSearchQuery = optionalStringValue(snapshot, "phoneSearchQuery", "snapshot");
    isLoading = requiredBooleanValue(snapshot, "isLoading", "snapshot");
    isFavorite = requiredBooleanValue(snapshot, "isFavorite", "snapshot");
    favoriteEnabled = requiredBooleanValue(snapshot, "favoriteEnabled", "snapshot");
    showWebsiteAction = requiredBooleanValue(snapshot, "showWebsiteAction", "snapshot");
    showCallAction = requiredBooleanValue(snapshot, "showCallAction", "snapshot");
    matchedTags = Collections.unmodifiableList(
      readStringArray(requiredArrayValue(snapshot, "matchedTags", "snapshot"), "snapshot.matchedTags")
    );
    locations = Collections.unmodifiableList(
      readLocations(requiredArrayValue(snapshot, "locations", "snapshot"), "snapshot.locations")
    );
    dishes = Collections.unmodifiableList(
      readDishes(requiredArrayValue(snapshot, "dishes", "snapshot"), "snapshot.dishes")
    );
  }

  @Nullable
  static RestaurantPanelSnapshotPayload fromReadableMap(@Nullable ReadableMap snapshot)
    throws DecodeException {
    if (snapshot == null) {
      return null;
    }
    return new RestaurantPanelSnapshotPayload(snapshot);
  }

  @NonNull
  private static List<Location> readLocations(
    @NonNull ReadableArray locations,
    @NonNull String path
  ) throws DecodeException {
    List<Location> result = new ArrayList<>();
    for (int index = 0; index < locations.size(); index += 1) {
      ReadableMap location = requiredMapElement(locations, index, path);
      result.add(new Location(location, path + "[" + index + "]"));
    }
    return result;
  }

  @NonNull
  private static List<HoursRow> readHoursRows(
    @NonNull ReadableArray hoursRows,
    @NonNull String path
  ) throws DecodeException {
    List<HoursRow> result = new ArrayList<>();
    for (int index = 0; index < hoursRows.size(); index += 1) {
      ReadableMap row = requiredMapElement(hoursRows, index, path);
      result.add(new HoursRow(row, path + "[" + index + "]"));
    }
    return result;
  }

  @NonNull
  private static List<Dish> readDishes(
    @NonNull ReadableArray dishes,
    @NonNull String path
  ) throws DecodeException {
    List<Dish> result = new ArrayList<>();
    for (int index = 0; index < dishes.size(); index += 1) {
      ReadableMap dish = requiredMapElement(dishes, index, path);
      result.add(new Dish(dish, path + "[" + index + "]"));
    }
    return result;
  }

  @NonNull
  private static List<String> readStringArray(
    @NonNull ReadableArray values,
    @NonNull String path
  ) throws DecodeException {
    List<String> result = new ArrayList<>();
    for (int index = 0; index < values.size(); index += 1) {
      if (values.getType(index) != ReadableType.String) {
        throw new DecodeException(
          "Expected string at " + path + "[" + index + "], received " + describeArrayType(values.getType(index))
        );
      }
      String value = values.getString(index);
      if (value == null) {
        throw new DecodeException("Expected string at " + path + "[" + index + "], received null");
      }
      result.add(value);
    }
    return result;
  }

  @NonNull
  private static String requiredStringValue(
    @NonNull ReadableMap map,
    @NonNull String key,
    @NonNull String path
  ) throws DecodeException {
    String fieldPath = path + "." + key;
    if (!map.hasKey(key) || map.isNull(key)) {
      throw new DecodeException("Expected string at " + fieldPath + ", received " + describeMissing(map, key));
    }
    if (map.getType(key) != ReadableType.String) {
      throw new DecodeException(
        "Expected string at " + fieldPath + ", received " + map.getType(key).name()
      );
    }
    String value = map.getString(key);
    if (value == null) {
      throw new DecodeException("Expected string at " + fieldPath + ", received null");
    }
    return value;
  }

  @Nullable
  private static String optionalStringValue(
    @NonNull ReadableMap map,
    @NonNull String key,
    @NonNull String path
  ) throws DecodeException {
    if (!map.hasKey(key) || map.isNull(key)) {
      return null;
    }
    if (map.getType(key) != ReadableType.String) {
      throw new DecodeException(
        "Expected string at " + path + "." + key + ", received " + map.getType(key).name()
      );
    }
    String value = map.getString(key);
    return value != null && !value.isEmpty() ? value : null;
  }

  private static boolean requiredBooleanValue(
    @NonNull ReadableMap map,
    @NonNull String key,
    @NonNull String path
  ) throws DecodeException {
    String fieldPath = path + "." + key;
    if (!map.hasKey(key) || map.isNull(key)) {
      throw new DecodeException("Expected boolean at " + fieldPath + ", received " + describeMissing(map, key));
    }
    if (map.getType(key) != ReadableType.Boolean) {
      throw new DecodeException(
        "Expected boolean at " + fieldPath + ", received " + map.getType(key).name()
      );
    }
    return map.getBoolean(key);
  }

  @NonNull
  private static ReadableArray requiredArrayValue(
    @NonNull ReadableMap map,
    @NonNull String key,
    @NonNull String path
  ) throws DecodeException {
    String fieldPath = path + "." + key;
    if (!map.hasKey(key) || map.isNull(key)) {
      throw new DecodeException("Expected array at " + fieldPath + ", received " + describeMissing(map, key));
    }
    if (map.getType(key) != ReadableType.Array) {
      throw new DecodeException(
        "Expected array at " + fieldPath + ", received " + map.getType(key).name()
      );
    }
    ReadableArray value = map.getArray(key);
    if (value == null) {
      throw new DecodeException("Expected array at " + fieldPath + ", received null");
    }
    return value;
  }

  @NonNull
  private static ReadableMap requiredMapElement(
    @NonNull ReadableArray array,
    int index,
    @NonNull String path
  ) throws DecodeException {
    ReadableType type = array.getType(index);
    if (type != ReadableType.Map) {
      throw new DecodeException(
        "Expected object at " + path + "[" + index + "], received " + describeArrayType(type)
      );
    }
    ReadableMap value = array.getMap(index);
    if (value == null) {
      throw new DecodeException("Expected object at " + path + "[" + index + "], received null");
    }
    return value;
  }

  @NonNull
  private static String describeMissing(@NonNull ReadableMap map, @NonNull String key) {
    if (!map.hasKey(key)) {
      return "missing";
    }
    return "null";
  }

  @NonNull
  private static String describeArrayType(@Nullable ReadableType type) {
    return type == null ? "null" : type.name();
  }
}
