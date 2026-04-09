package com.crave;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

final class RestaurantPanelSnapshotPayload {
  static final class HoursRow {
    final String label;
    final String value;

    HoursRow(@NonNull ReadableMap row) {
      label = stringValue(row, "label", "");
      value = stringValue(row, "value", "");
    }
  }

  static final class Location {
    final String title;
    @Nullable final String status;
    final String address;
    @Nullable final String phone;
    @NonNull final List<HoursRow> hoursRows;
    @Nullable final String websiteHost;

    Location(@NonNull ReadableMap location) {
      title = stringValue(location, "title", "Location");
      status = optionalStringValue(location, "status");
      address = stringValue(location, "address", "Address unavailable");
      phone = optionalStringValue(location, "phone");
      hoursRows = Collections.unmodifiableList(readHoursRows(arrayValue(location, "hoursRows")));
      websiteHost = optionalStringValue(location, "websiteHost");
    }
  }

  static final class Dish {
    final String id;
    final String name;
    final String score;
    final String activity;
    final String pollCount;
    final String totalVotes;

    Dish(@NonNull ReadableMap dish) {
      id = stringValue(dish, "id", "");
      name = stringValue(dish, "name", "");
      score = stringValue(dish, "score", "—");
      activity = stringValue(dish, "activity", "");
      pollCount = stringValue(dish, "pollCount", "0");
      totalVotes = stringValue(dish, "totalVotes", "0");
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
  @NonNull final List<Location> locations;
  @NonNull final List<Dish> dishes;

  private RestaurantPanelSnapshotPayload(@NonNull ReadableMap snapshot) {
    restaurantId = optionalStringValue(snapshot, "restaurantId");
    restaurantName = stringValue(snapshot, "restaurantName", "");
    primaryAddress = stringValue(snapshot, "primaryAddress", "");
    shareMessage = optionalStringValue(snapshot, "shareMessage");
    restaurantScore = stringValue(snapshot, "restaurantScore", "—");
    queryScoreLabel = stringValue(snapshot, "queryScoreLabel", "Query score");
    queryScoreValue = stringValue(snapshot, "queryScoreValue", "—");
    priceLabel = stringValue(snapshot, "priceLabel", "—");
    hoursSummary = stringValue(snapshot, "hoursSummary", "Hours unavailable");
    locationsLabel = stringValue(snapshot, "locationsLabel", "");
    websiteUrl = optionalStringValue(snapshot, "websiteUrl");
    websiteSearchQuery = optionalStringValue(snapshot, "websiteSearchQuery");
    phoneNumber = optionalStringValue(snapshot, "phoneNumber");
    phoneSearchQuery = optionalStringValue(snapshot, "phoneSearchQuery");
    isLoading = booleanValue(snapshot, "isLoading");
    isFavorite = booleanValue(snapshot, "isFavorite");
    favoriteEnabled = booleanValue(snapshot, "favoriteEnabled");
    showWebsiteAction = booleanValue(snapshot, "showWebsiteAction");
    showCallAction = booleanValue(snapshot, "showCallAction");
    locations = Collections.unmodifiableList(readLocations(arrayValue(snapshot, "locations")));
    dishes = Collections.unmodifiableList(readDishes(arrayValue(snapshot, "dishes")));
  }

  @Nullable
  static RestaurantPanelSnapshotPayload fromReadableMap(@Nullable ReadableMap snapshot) {
    if (snapshot == null) {
      return null;
    }
    return new RestaurantPanelSnapshotPayload(snapshot);
  }

  @NonNull
  private static List<Location> readLocations(@Nullable ReadableArray locations) {
    if (locations == null) {
      return Collections.emptyList();
    }
    List<Location> result = new ArrayList<>();
    for (int index = 0; index < locations.size(); index += 1) {
      ReadableMap location = locations.getMap(index);
      if (location != null) {
        result.add(new Location(location));
      }
    }
    return result;
  }

  @NonNull
  private static List<HoursRow> readHoursRows(@Nullable ReadableArray hoursRows) {
    if (hoursRows == null) {
      return Collections.emptyList();
    }
    List<HoursRow> result = new ArrayList<>();
    for (int index = 0; index < hoursRows.size(); index += 1) {
      ReadableMap row = hoursRows.getMap(index);
      if (row != null) {
        result.add(new HoursRow(row));
      }
    }
    return result;
  }

  @NonNull
  private static List<Dish> readDishes(@Nullable ReadableArray dishes) {
    if (dishes == null) {
      return Collections.emptyList();
    }
    List<Dish> result = new ArrayList<>();
    for (int index = 0; index < dishes.size(); index += 1) {
      ReadableMap dish = dishes.getMap(index);
      if (dish != null) {
        result.add(new Dish(dish));
      }
    }
    return result;
  }

  @NonNull
  private static String stringValue(
    @NonNull ReadableMap map,
    @NonNull String key,
    @NonNull String fallback
  ) {
    String value = optionalStringValue(map, key);
    return value != null ? value : fallback;
  }

  @Nullable
  private static String optionalStringValue(@NonNull ReadableMap map, @NonNull String key) {
    if (!map.hasKey(key) || map.isNull(key)) {
      return null;
    }
    String value = map.getString(key);
    return value != null && !value.isEmpty() ? value : null;
  }

  private static boolean booleanValue(@NonNull ReadableMap map, @NonNull String key) {
    return map.hasKey(key) && !map.isNull(key) && map.getBoolean(key);
  }

  @Nullable
  private static ReadableArray arrayValue(@NonNull ReadableMap map, @NonNull String key) {
    return map.hasKey(key) && !map.isNull(key) ? map.getArray(key) : null;
  }
}
