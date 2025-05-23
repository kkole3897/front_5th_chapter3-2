import { ChakraProvider } from '@chakra-ui/react';
import { render, screen, within, act } from '@testing-library/react';
import { UserEvent, userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ReactElement } from 'react';

import {
  setupMockHandlerCreation,
  setupMockHandlerDeletion,
  setupMockHandlerUpdating,
} from '../__mocks__/handlersUtils';
import App from '../App';
import { server } from '../setupTests';
import { Event, RepeatType } from '../types';

// ! Hard 여기 제공 안함
const setup = (element: ReactElement) => {
  const user = userEvent.setup();

  return { ...render(<ChakraProvider>{element}</ChakraProvider>), user }; // ? Med: 왜 ChakraProvider로 감싸는지 물어보자
};

// ! Hard 여기 제공 안함
const saveSchedule = async (
  user: UserEvent,
  form: Omit<Event, 'id' | 'notificationTime' | 'repeat'> & {
    isRepeating?: boolean;
    repeatType?: Exclude<RepeatType, 'none'>;
    repeatInterval?: number;
    repeatEndDate?: string;
    repeatCount?: number;
  }
) => {
  const { title, date, startTime, endTime, location, description, category } = form;

  await user.click(screen.getAllByText('일정 추가')[0]);

  await user.type(screen.getByLabelText('제목'), title);
  await user.type(screen.getByLabelText('날짜'), date);
  await user.type(screen.getByLabelText('시작 시간'), startTime);
  await user.type(screen.getByLabelText('종료 시간'), endTime);
  await user.type(screen.getByLabelText('설명'), description);
  await user.type(screen.getByLabelText('위치'), location);
  await user.selectOptions(screen.getByLabelText('카테고리'), category);
  const isRepeatingCheckbox = screen.getByLabelText<HTMLInputElement>('반복 일정');

  if (form.isRepeating) {
    if (!isRepeatingCheckbox.checked) {
      await user.click(isRepeatingCheckbox);
    }

    if (form.repeatType) {
      await user.selectOptions(await screen.findByLabelText('반복 유형'), form.repeatType!);
    }
    if (form.repeatInterval) {
      const intervalInput = await screen.findByLabelText('반복 간격');
      await user.clear(intervalInput);
      await user.type(intervalInput, form.repeatInterval!.toString());
    }

    if (form.repeatEndDate) {
      const repeatEndArea = (await screen.findByText('반복 종료')).parentElement;
      await user.click(within(repeatEndArea!).getByLabelText('날짜'));
      await user.type(screen.getByLabelText('반복 종료일'), form.repeatEndDate);
    } else if (form.repeatCount) {
      const repeatEndArea = (await screen.findByText('반복 종료')).parentElement;
      await user.click(within(repeatEndArea!).getByLabelText('횟수'));
      const repeatCountInput = screen.getByLabelText('반복 횟수');
      await user.clear(repeatCountInput);
      await user.type(repeatCountInput, form.repeatCount.toString());
    }
  } else {
    if (isRepeatingCheckbox.checked) {
      await user.click(isRepeatingCheckbox);
    }
  }

  await user.click(screen.getByTestId('event-submit-button'));
};

describe('일정 CRUD 및 기본 기능', () => {
  it('입력한 새로운 일정 정보에 맞춰 모든 필드가 이벤트 리스트에 정확히 저장된다.', async () => {
    setupMockHandlerCreation();

    const { user } = setup(<App />);

    await saveSchedule(user, {
      title: '새 회의',
      date: '2025-10-15',
      startTime: '14:00',
      endTime: '15:00',
      description: '프로젝트 진행 상황 논의',
      location: '회의실 A',
      category: '업무',
    });

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('새 회의')).toBeInTheDocument();
    expect(eventList.getByText('2025-10-15')).toBeInTheDocument();
    expect(eventList.getByText('14:00 - 15:00')).toBeInTheDocument();
    expect(eventList.getByText('프로젝트 진행 상황 논의')).toBeInTheDocument();
    expect(eventList.getByText('회의실 A')).toBeInTheDocument();
    expect(eventList.getByText('카테고리: 업무')).toBeInTheDocument();
  });

  it('기존 일정의 세부 정보를 수정하고 변경사항이 정확히 반영된다', async () => {
    const { user } = setup(<App />);

    setupMockHandlerUpdating();

    await user.click(await screen.findByLabelText('Edit event'));

    await user.clear(screen.getByLabelText('제목'));
    await user.type(screen.getByLabelText('제목'), '수정된 회의');
    await user.clear(screen.getByLabelText('설명'));
    await user.type(screen.getByLabelText('설명'), '회의 내용 변경');

    await user.click(screen.getByTestId('event-submit-button'));

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('수정된 회의')).toBeInTheDocument();
    expect(eventList.getByText('회의 내용 변경')).toBeInTheDocument();
  });

  it('일정을 삭제하고 더 이상 조회되지 않는지 확인한다', async () => {
    setupMockHandlerDeletion();

    const { user } = setup(<App />);
    const eventList = within(screen.getByTestId('event-list'));
    expect(await eventList.findByText('삭제할 이벤트')).toBeInTheDocument();

    // 삭제 버튼 클릭
    const allDeleteButton = await screen.findAllByLabelText('Delete event');
    await user.click(allDeleteButton[0]);

    expect(eventList.queryByText('삭제할 이벤트')).not.toBeInTheDocument();
  });
});

describe('일정 뷰', () => {
  it('주별 뷰를 선택 후 해당 주에 일정이 없으면, 일정이 표시되지 않는다.', async () => {
    // ! 현재 시스템 시간 2025-10-01
    const { user } = setup(<App />);

    await user.selectOptions(screen.getByLabelText('view'), 'week');

    // ! 일정 로딩 완료 후 테스트
    await screen.findByText('일정 로딩 완료!');

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('검색 결과가 없습니다.')).toBeInTheDocument();
  });

  it('주별 뷰 선택 후 해당 일자에 일정이 존재한다면 해당 일정이 정확히 표시된다', async () => {
    setupMockHandlerCreation();

    const { user } = setup(<App />);
    await saveSchedule(user, {
      title: '이번주 팀 회의',
      date: '2025-10-02',
      startTime: '09:00',
      endTime: '10:00',
      description: '이번주 팀 회의입니다.',
      location: '회의실 A',
      category: '업무',
    });

    await user.selectOptions(screen.getByLabelText('view'), 'week');

    const weekView = within(screen.getByTestId('week-view'));
    expect(weekView.getByText('이번주 팀 회의')).toBeInTheDocument();
  });

  it('월별 뷰에 일정이 없으면, 일정이 표시되지 않아야 한다.', async () => {
    vi.setSystemTime(new Date('2025-01-01'));

    setup(<App />);

    // ! 일정 로딩 완료 후 테스트
    await screen.findByText('일정 로딩 완료!');

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('검색 결과가 없습니다.')).toBeInTheDocument();
  });

  it('월별 뷰에 일정이 정확히 표시되는지 확인한다', async () => {
    setupMockHandlerCreation();

    const { user } = setup(<App />);
    await saveSchedule(user, {
      title: '이번달 팀 회의',
      date: '2025-10-02',
      startTime: '09:00',
      endTime: '10:00',
      description: '이번달 팀 회의입니다.',
      location: '회의실 A',
      category: '업무',
    });

    const monthView = within(screen.getByTestId('month-view'));
    expect(monthView.getByText('이번달 팀 회의')).toBeInTheDocument();
  });

  it('달력에 1월 1일(신정)이 공휴일로 표시되는지 확인한다', async () => {
    vi.setSystemTime(new Date('2025-01-01'));
    setup(<App />);

    const monthView = screen.getByTestId('month-view');

    // 1월 1일 셀 확인
    const januaryFirstCell = within(monthView).getByText('1').closest('td')!;
    expect(within(januaryFirstCell).getByText('신정')).toBeInTheDocument();
  });
});

describe('검색 기능', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/events', () => {
        return HttpResponse.json({
          events: [
            {
              id: 1,
              title: '팀 회의',
              date: '2025-10-15',
              startTime: '09:00',
              endTime: '10:00',
              description: '주간 팀 미팅',
              location: '회의실 A',
              category: '업무',
              repeat: { type: 'none', interval: 0 },
              notificationTime: 10,
            },
            {
              id: 2,
              title: '프로젝트 계획',
              date: '2025-10-16',
              startTime: '14:00',
              endTime: '15:00',
              description: '새 프로젝트 계획 수립',
              location: '회의실 B',
              category: '업무',
              repeat: { type: 'none', interval: 0 },
              notificationTime: 10,
            },
          ],
        });
      })
    );
  });

  afterEach(() => {
    server.resetHandlers();
  });

  it('검색 결과가 없으면, "검색 결과가 없습니다."가 표시되어야 한다.', async () => {
    const { user } = setup(<App />);

    const searchInput = screen.getByPlaceholderText('검색어를 입력하세요');
    await user.type(searchInput, '존재하지 않는 일정');

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('검색 결과가 없습니다.')).toBeInTheDocument();
  });

  it("'팀 회의'를 검색하면 해당 제목을 가진 일정이 리스트에 노출된다", async () => {
    const { user } = setup(<App />);

    const searchInput = screen.getByPlaceholderText('검색어를 입력하세요');
    await user.type(searchInput, '팀 회의');

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('팀 회의')).toBeInTheDocument();
  });

  it('검색어를 지우면 모든 일정이 다시 표시되어야 한다', async () => {
    const { user } = setup(<App />);

    const searchInput = screen.getByPlaceholderText('검색어를 입력하세요');
    await user.type(searchInput, '팀 회의');
    await user.clear(searchInput);

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('팀 회의')).toBeInTheDocument();
    expect(eventList.getByText('프로젝트 계획')).toBeInTheDocument();
  });
});

describe('일정 충돌', () => {
  afterEach(() => {
    server.resetHandlers();
  });

  it('겹치는 시간에 새 일정을 추가할 때 경고가 표시된다', async () => {
    setupMockHandlerCreation([
      {
        id: '1',
        title: '기존 회의',
        date: '2025-10-15',
        startTime: '09:00',
        endTime: '10:00',
        description: '기존 팀 미팅',
        location: '회의실 B',
        category: '업무',
        repeat: { type: 'none', interval: 0 },
        notificationTime: 10,
      },
    ]);

    const { user } = setup(<App />);

    await saveSchedule(user, {
      title: '새 회의',
      date: '2025-10-15',
      startTime: '09:30',
      endTime: '10:30',
      description: '설명',
      location: '회의실 A',
      category: '업무',
    });

    expect(screen.getByText('일정 겹침 경고')).toBeInTheDocument();
    expect(screen.getByText(/다음 일정과 겹칩니다/)).toBeInTheDocument();
    expect(screen.getByText('기존 회의 (2025-10-15 09:00-10:00)')).toBeInTheDocument();
  });

  it('기존 일정의 시간을 수정하여 충돌이 발생하면 경고가 노출된다', async () => {
    setupMockHandlerUpdating();

    const { user } = setup(<App />);

    const editButton = (await screen.findAllByLabelText('Edit event'))[1];
    await user.click(editButton);

    // 시간 수정하여 다른 일정과 충돌 발생
    await user.clear(screen.getByLabelText('시작 시간'));
    await user.type(screen.getByLabelText('시작 시간'), '08:30');
    await user.clear(screen.getByLabelText('종료 시간'));
    await user.type(screen.getByLabelText('종료 시간'), '10:30');

    await user.click(screen.getByTestId('event-submit-button'));

    expect(screen.getByText('일정 겹침 경고')).toBeInTheDocument();
    expect(screen.getByText(/다음 일정과 겹칩니다/)).toBeInTheDocument();
    expect(screen.getByText('기존 회의 (2025-10-15 09:00-10:00)')).toBeInTheDocument();
  });
});

it('notificationTime을 10으로 하면 지정 시간 10분 전 알람 텍스트가 노출된다', async () => {
  vi.setSystemTime(new Date('2025-10-15 08:49:59'));

  setup(<App />);

  // ! 일정 로딩 완료 후 테스트
  await screen.findByText('일정 로딩 완료!');

  expect(screen.queryByText('10분 후 기존 회의 일정이 시작됩니다.')).not.toBeInTheDocument();

  act(() => {
    vi.advanceTimersByTime(1000);
  });

  expect(screen.getByText('10분 후 기존 회의 일정이 시작됩니다.')).toBeInTheDocument();
});

describe('반복 일정 추가', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2025-09-15 08:49:59'));
  });

  afterEach(() => {
    server.resetHandlers();
    vi.useRealTimers();
  });

  it('반복 일정 추가를 선택하면 기본적으로 매일 1일 반복으로 설정된다.', async () => {
    setupMockHandlerCreation();

    const { user } = setup(<App />);
    const repeatDates = [
      '2025-09-15',
      '2025-09-16',
      '2025-09-17',
      '2025-09-18',
      '2025-09-19',
      '2025-09-20',
      '2025-09-21',
      '2025-09-22',
      '2025-09-23',
      '2025-09-24',
      '2025-09-25',
      '2025-09-26',
      '2025-09-27',
      '2025-09-28',
      '2025-09-29',
      '2025-09-30',
    ];

    await saveSchedule(user, {
      title: '새로운 반복 일정 타이틀',
      date: '2025-09-15',
      startTime: '09:00',
      endTime: '10:00',
      description: '새로운 반복 일정 설명',
      location: '회의실 A',
      category: '업무',
      isRepeating: true,
    });

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getAllByText('새로운 반복 일정 타이틀')).toHaveLength(repeatDates.length);
    expect(eventList.getAllByText('반복: 1일마다')).toHaveLength(repeatDates.length);

    repeatDates.forEach((date) => {
      expect(eventList.getByText(date)).toBeInTheDocument();
    });
  });

  it('반복 일정 추가를 선택하고 반복 유형을 주간으로 설정하면 매주 1회 반복으로 설정된다.', async () => {
    setupMockHandlerCreation();

    const { user } = setup(<App />);
    const repeatDates = ['2025-09-15', '2025-09-22', '2025-09-29'];

    await saveSchedule(user, {
      title: '새로운 반복 일정 타이틀',
      date: '2025-09-15',
      startTime: '09:00',
      endTime: '10:00',
      description: '새로운 반복 일정 설명',
      location: '회의실 A',
      category: '업무',
      isRepeating: true,
      repeatType: 'weekly',
      repeatInterval: 1,
    });

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getAllByText('새로운 반복 일정 타이틀')).toHaveLength(repeatDates.length);
    expect(eventList.getAllByText('반복: 1주마다')).toHaveLength(repeatDates.length);

    repeatDates.forEach((date) => {
      expect(eventList.getByText(date)).toBeInTheDocument();
    });
  });

  it('"2025-08-28"에 월간 반복 일정을 추가하면 "2025-09-28" 날짜의 반복 이벤트가 보인다.', async () => {
    setupMockHandlerCreation();

    const { user } = setup(<App />);

    await saveSchedule(user, {
      title: '새로운 반복 일정 타이틀',
      date: '2025-08-28',
      startTime: '09:00',
      endTime: '10:00',
      description: '새로운 반복 일정 설명',
      location: '회의실 A',
      category: '업무',
      isRepeating: true,
      repeatType: 'monthly',
      repeatInterval: 1,
    });

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('새로운 반복 일정 타이틀')).toBeInTheDocument();
    expect(eventList.getByText('반복: 1월마다')).toBeInTheDocument();
    expect(eventList.getByText('2025-09-28')).toBeInTheDocument();
  });

  it('"2024-09-29"에 매년 반복 일정을 추가하면 "2025-09-29" 날짜의 반복 이벤트가 보인다.', async () => {
    setupMockHandlerCreation();

    const { user } = setup(<App />);

    await saveSchedule(user, {
      title: '새로운 반복 일정 타이틀',
      date: '2024-09-29',
      startTime: '09:00',
      endTime: '10:00',
      description: '새로운 반복 일정 설명',
      location: '회의실 A',
      category: '업무',
      isRepeating: true,
      repeatType: 'yearly',
      repeatInterval: 1,
    });

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('새로운 반복 일정 타이틀')).toBeInTheDocument();
    expect(eventList.getByText('반복: 1년마다')).toBeInTheDocument();
    expect(eventList.getByText('2025-09-29')).toBeInTheDocument();
  });

  it('윤년 "2024-02-29"에 매월 반복을 추가해도 윤년이 아닌 2025년 2월에는 반복 이벤트가 표시되지 않는다', async () => {
    vi.setSystemTime(new Date('2025-02-15 08:49:59'));
    setupMockHandlerCreation();

    const { user } = setup(<App />);

    await saveSchedule(user, {
      title: '새로운 반복 일정 타이틀',
      date: '2024-02-29',
      startTime: '09:00',
      endTime: '10:00',
      description: '새로운 반복 일정 설명',
      location: '회의실 A',
      category: '업무',
      isRepeating: true,
      repeatType: 'monthly',
      repeatInterval: 1,
    });

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.queryByText('새로운 반복 일정 타이틀')).not.toBeInTheDocument();
    expect(eventList.queryByText('반복: 1월마다')).not.toBeInTheDocument();
    expect(eventList.queryByText('2025-02-29')).not.toBeInTheDocument();
    expect(eventList.queryByText('2025-02-28')).not.toBeInTheDocument();
  });

  it('윤년 "2024-02-29"에 매년 반복을 추가해도 윤년이 아닌 2025년 2월에는 반복 이벤트가 표시되지 않는다', async () => {
    vi.setSystemTime(new Date('2025-02-15 08:49:59'));
    setupMockHandlerCreation();

    const { user } = setup(<App />);

    await saveSchedule(user, {
      title: '새로운 반복 일정 타이틀',
      date: '2024-02-29',
      startTime: '09:00',
      endTime: '10:00',
      description: '새로운 반복 일정 설명',
      location: '회의실 A',
      category: '업무',
      isRepeating: true,
      repeatType: 'yearly',
      repeatInterval: 1,
    });

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.queryByText('새로운 반복 일정 타이틀')).not.toBeInTheDocument();
    expect(eventList.queryByText('반복: 1년마다')).not.toBeInTheDocument();
    expect(eventList.queryByText('2025-02-28')).not.toBeInTheDocument();
    expect(eventList.queryByText('2025-02-29')).not.toBeInTheDocument();
  });

  it('31일이 있는 달에 매월 반복 일정을 추가해도 30일까지 있는 달에는 이벤트가 추가되지 않는다.', async () => {
    setupMockHandlerCreation();

    const { user } = setup(<App />);

    await saveSchedule(user, {
      title: '새로운 반복 일정 타이틀',
      date: '2025-03-31',
      startTime: '09:00',
      endTime: '10:00',
      description: '새로운 반복 일정 설명',
      location: '회의실 A',
      category: '업무',
      isRepeating: true,
      repeatType: 'monthly',
      repeatInterval: 1,
    });

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.queryByText('새로운 반복 일정 타이틀')).not.toBeInTheDocument();
    expect(eventList.queryByText('반복: 1월마다')).not.toBeInTheDocument();
    expect(eventList.queryByText('2025-09-30')).not.toBeInTheDocument();
    expect(eventList.queryByText('2025-09-31')).not.toBeInTheDocument();
  });

  it('날짜를 기준으로 반복 일정 종료를 설정할 수 있다.', async () => {
    setupMockHandlerCreation();

    const { user } = setup(<App />);
    const repeatDates = ['2025-09-15', '2025-09-16', '2025-09-17', '2025-09-18'];

    await saveSchedule(user, {
      title: '새로운 반복 일정 타이틀',
      date: '2025-09-15',
      startTime: '09:00',
      endTime: '10:00',
      description: '새로운 반복 일정 설명',
      location: '회의실 A',
      category: '업무',
      isRepeating: true,
      repeatType: 'daily',
      repeatInterval: 1,
      repeatEndDate: '2025-09-18',
    });

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getAllByText('새로운 반복 일정 타이틀')).toHaveLength(repeatDates.length);

    repeatDates.forEach((date) => {
      expect(eventList.getByText(date)).toBeInTheDocument();
    });
  });

  it('횟수를 기준으로 반복 일정 종료를 설정할 수 있다.', async () => {
    setupMockHandlerCreation();

    const { user } = setup(<App />);
    const repeatDates = ['2025-09-15', '2025-09-16', '2025-09-17'];

    await saveSchedule(user, {
      title: '새로운 반복 일정 타이틀',
      date: '2025-09-15',
      startTime: '09:00',
      endTime: '10:00',
      description: '새로운 반복 일정 설명',
      location: '회의실 A',
      category: '업무',
      isRepeating: true,
      repeatType: 'daily',
      repeatInterval: 1,
      repeatCount: 3,
    });

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getAllByText('새로운 반복 일정 타이틀')).toHaveLength(repeatDates.length);

    repeatDates.forEach((date) => {
      expect(eventList.getByText(date)).toBeInTheDocument();
    });
  });

  it('반복 일정인 경우 캘린더에 반복 아이콘이 표시된다.', async () => {
    const events: Event[] = [
      {
        id: '1',
        title: '반복 일정',
        date: '2025-09-15',
        startTime: '09:00',
        endTime: '10:00',
        description: '반복 일정 설명',
        location: '회의실 A',
        category: '업무',
        repeat: { type: 'daily', interval: 1, count: 2, id: '1' },
        notificationTime: 10,
      },
      {
        id: '2',
        title: '반복 일정',
        date: '2025-09-16',
        startTime: '09:00',
        endTime: '10:00',
        description: '반복 일정 설명',
        location: '회의실 A',
        category: '업무',
        repeat: { type: 'daily', interval: 1, count: 2, id: '1' },
        notificationTime: 10,
      },
    ];
    setupMockHandlerCreation(events);
    setup(<App />);

    await screen.findByText('일정 로딩 완료!');

    const calendar = screen.getByTestId('month-view');
    const repeatIconContainers = within(calendar).getAllByTestId('repeat-icon');
    const eventTitles = within(calendar).getAllByText('반복 일정');

    expect(repeatIconContainers).toHaveLength(eventTitles.length);

    repeatIconContainers.forEach((container) => {
      expect(container).toHaveAttribute('aria-label', '반복');
      expect(container.querySelector('svg')).toBeInTheDocument();
    });
  });
});
