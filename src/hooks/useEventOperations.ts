import { useToast } from '@chakra-ui/react';
import { useEffect, useState } from 'react';

import { Event, EventForm } from '../types';
import { getRepeatingDates, GetRepeatingDatesOptions } from '../utils/repeatEvent';

export const useEventOperations = (editing: boolean, onSave?: () => void) => {
  const [events, setEvents] = useState<Event[]>([]);
  const toast = useToast();

  const fetchEvents = async () => {
    try {
      const response = await fetch('/api/events');
      if (!response.ok) {
        throw new Error('Failed to fetch events');
      }
      const { events } = await response.json();
      setEvents(events);
    } catch (error) {
      console.error('Error fetching events:', error);
      toast({
        title: '이벤트 로딩 실패',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const saveEvent = async (eventData: Event | EventForm) => {
    try {
      let response;
      if (editing) {
        const editingEvent = eventData as Event;
        const originalEvent = events.find((event) => event.id === editingEvent.id);

        const isOriginalEventRepeating = originalEvent!.repeat.type !== 'none';
        const updatedRepeat = {
          type: 'none',
          interval: 0,
        };

        if (!isOriginalEventRepeating) {
          const updatedEvent = {
            ...editingEvent,
            repeat: updatedRepeat,
          };

          response = await fetch(`/api/events/${(eventData as Event).id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedEvent),
          });
        } else {
          const updatedEvents = events
            .filter((event) => event.repeat.id && event.repeat.id === originalEvent!.repeat.id)
            .map((event) => {
              if (event.id === editingEvent.id) {
                return {
                  ...editingEvent,
                  repeat: updatedRepeat,
                };
              }

              return {
                ...event,
                repeat: updatedRepeat,
              };
            });

          response = await fetch('/api/events-list', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ events: updatedEvents }),
          });
        }
      } else {
        if (eventData.repeat.type === 'none') {
          response = await fetch('/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData),
          });
        } else {
          const repeatingDates = getRepeatingDates(
            eventData.date,
            // TODO: 조건에 따른 타입 추론되도록 변경
            eventData.repeat as GetRepeatingDatesOptions
          );

          const events = repeatingDates.map((date) => ({
            ...eventData,
            date,
          }));

          response = await fetch('/api/events-list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ events }),
          });
        }
      }

      if (!response.ok) {
        throw new Error('Failed to save event');
      }

      await fetchEvents();
      onSave?.();
      toast({
        title: editing ? '일정이 수정되었습니다.' : '일정이 추가되었습니다.',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      console.error('Error saving event:', error);
      toast({
        title: '일정 저장 실패',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const deleteEvent = async (id: string) => {
    try {
      const response = await fetch(`/api/events/${id}`, { method: 'DELETE' });

      if (!response.ok) {
        throw new Error('Failed to delete event');
      }

      await fetchEvents();
      toast({
        title: '일정이 삭제되었습니다.',
        status: 'info',
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      console.error('Error deleting event:', error);
      toast({
        title: '일정 삭제 실패',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  async function init() {
    await fetchEvents();
    toast({
      title: '일정 로딩 완료!',
      status: 'info',
      duration: 1000,
    });
  }

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { events, fetchEvents, saveEvent, deleteEvent };
};
